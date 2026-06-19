import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { logScreenView, logEvent, logFormSubmit, logError, logButtonTap } from '@/lib/analytics';

// Design Constants
const UI_COLORS = {
  bg: '#FFF9F6',
  primary: '#FF4D3D',
  accent: '#FF8A00',
  branding: '#FF3D57',
  surface: '#FFF0EA',
  text: '#172033',
  textLight: '#667085',
  border: '#E9E4E0',
  card: '#FFFFFF',
};

// Carousel width = screen width minus the ScrollView contentContainer's
// horizontal padding (24 each side). pagingEnabled snaps to this width.
const CAROUSEL_WIDTH = Dimensions.get('window').width - 48;

// V2 questionnaire-answer Hebrew labels for the profile preview rows.
// Source of truth for the option values lives in app/questionnaire.tsx.
const LABEL_MAPS: Record<string, Record<string, string>> = {
  intent_type: {
    long_term: 'קשר לטווח ארוך',
    short_term: 'קשר קצר',
    casual: 'סטוצים / קשר לא מחייב',
    open_flow: 'ראש פתוח וזורם',
  },
  preferred_first_date: {
    coffee: 'בית קפה',
    restaurant: 'מסעדה',
    bar: 'בר / דרינק',
    picnic: 'פיקניק',
    nature_walk: 'טיול בטבע',
    active: 'פעילות אקטיבית',
    home_evening: 'ערב ביתי',
    connection_matters: 'לא משנה מה עושים, העיקר החיבור',
  },
  conflict_style: {
    talk_immediately: 'רוצה לדבר מיד',
    need_cooldown: 'צריך/ה זמן להירגע',
    avoidant: 'נמנע/ת מעימותים',
    situational: 'תלוי במצב',
  },
};

function labelFor(field: keyof typeof LABEL_MAPS, value: unknown): string {
  if (typeof value !== 'string' || !value) return 'לא צוין';
  return LABEL_MAPS[field]?.[value] ?? 'לא צוין';
}

export default function MyProfileScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editingAnswers, setEditingAnswers] = useState(false);
  
  const scrollThresholds = React.useRef<Set<number>>(new Set());
  const sectionsLogged = React.useRef<Set<string>>(new Set());

  // Editable fields
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');

  // Photo carousel index (clamped at render time against photos.length).
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const carouselRef = useRef<ScrollView>(null);

  // When a photo is deleted, clamp currentPhotoIndex and scroll the carousel
  // to the new last cell so the user doesn't end up looking at blank space.
  useEffect(() => {
    if (photos.length === 0) {
      setCurrentPhotoIndex(0);
      return;
    }
    if (currentPhotoIndex >= photos.length) {
      const newIndex = photos.length - 1;
      setCurrentPhotoIndex(newIndex);
      carouselRef.current?.scrollTo({ x: newIndex * CAROUSEL_WIDTH, animated: false });
    }
  }, [photos.length]);

  const handleCarouselScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_WIDTH);
    setCurrentPhotoIndex(idx);
  };

  const isDark = colorScheme === 'dark';
  const dynamicColors = {
    bg: isDark ? '#101828' : UI_COLORS.bg,
    card: isDark ? '#1D2939' : UI_COLORS.card,
    text: isDark ? '#FFFFFF' : UI_COLORS.text,
    textLight: isDark ? '#98A2B3' : UI_COLORS.textLight,
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : UI_COLORS.border,
    inputBg: isDark ? '#1D2939' : '#F4F4F4',
  };

  useEffect(() => {
    logScreenView('MyProfile');
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      
      // Generate signed URL for avatar if storage_path exists
      let avatarUrl = profileData.avatar_url;
      if (profileData.avatar_storage_path) {
        const { data: signedData, error: signedError } = await supabase.storage
          .from('profile-photos')
          .createSignedUrl(profileData.avatar_storage_path, 3600);
        if (!signedError) {
          avatarUrl = signedData.signedUrl;
        }
      }

      setProfile({ ...profileData, avatar_url: avatarUrl });
      setUsername(profileData.username || '');
      setBio(profileData.bio || '');

      const { data: photosData, error: photosError } = await supabase
        .from('profile_photos')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true });

      if (photosError) throw photosError;
      
      // Generate signed URLs for all photos
      const photosWithSignedUrls = await Promise.all((photosData || []).map(async (photo) => {
        if (photo.storage_path) {
          const { data, error } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(photo.storage_path, 3600);
          if (!error) {
            return { ...photo, url: data.signedUrl };
          }
        }
        return photo;
      }));

      setPhotos(photosWithSignedUrls);

      const { data: answersData, error: answersError } = await supabase
        .from('questionnaire_answers')
        .select('answers')
        .eq('user_id', user.id)
        .single();
      
      if (answersError && answersError.code !== 'PGRST116') throw answersError;
      setAnswers(answersData?.answers || null);

    } catch (error) {
      console.error('Error fetching profile:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לטעון את נתוני הפרופיל');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      logButtonTap('MyProfile', 'save_profile');
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          username: username.trim(),
          bio: bio.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        logError('MyProfile', 'profile_update_failed', error);
        throw error;
      }
      
      logFormSubmit('MyProfile', 'profile_updated');
      setProfile({ ...profile, username, bio });
      setEditing(false);
      Alert.alert('הצלחה', 'הפרופיל עודכן בהצלחה');
    } catch (error) {
      logError('MyProfile', 'profile_update_failed', error);
      console.error('Error updating profile:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לעדכן את הפרופיל');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 1,
      });

      // Treat any cancel/empty-asset shape as a silent no-op so dismiss gestures
      // never surface as a phantom upload error.
      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }
      uploadImage(result.assets[0].uri);
    } catch (error) {
      logError('MyProfile', 'image_picker_failed', error);
      console.error('Error picking image:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לבחור תמונה');
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);
      logEvent('photo_upload_started', { screen: 'MyProfile' });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Compress and resize
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipResult.base64) throw new Error('Failed to get base64 string');

      // 2. Upload to storage
      const fileName = `${user.id}/${Date.now()}.jpg`;
      const { error: storageError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, decode(manipResult.base64), {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) {
        logError('MyProfile', 'photo_upload_failed', storageError);
        throw storageError;
      }

      // 3. Generate signed URL for UI update
      const { data: signedData, error: signedError } = await supabase.storage
        .from('profile-photos')
        .createSignedUrl(fileName, 3600);

      if (signedError) {
        logError('MyProfile', 'signed_url_generation_failed', signedError);
        throw signedError;
      }

      // 4. Save to profile_photos table
      const { data: photoData, error: tableError } = await supabase
        .from('profile_photos')
        .insert({
          user_id: user.id,
          storage_path: fileName,
          display_order: photos.length,
        })
        .select()
        .single();

      if (tableError) {
        logError('MyProfile', 'photo_db_insert_failed', tableError);
        throw tableError;
      }

      logEvent('photo_upload_succeeded', { screen: 'MyProfile' });
      const newPhoto = { ...photoData, url: signedData.signedUrl };
      setPhotos([...photos, newPhoto]);
      
      if (!profile.avatar_url) {
        await supabase
          .from('profiles')
          .update({ avatar_storage_path: fileName })
          .eq('id', user.id);
        setProfile({ ...profile, avatar_url: signedData.signedUrl, avatar_storage_path: fileName });
      }

    } catch (error) {
      logError('MyProfile', 'uploadImage_exception', error);
      console.error('Error uploading image:', error);
      Alert.alert('שגיאה', 'לא הצלחנו להעלות את התמונה');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (photoId: string, storagePath: string) => {
    try {
      setLoading(true);
      logEvent('photo_deleted', { screen: 'MyProfile' });
      const { error: tableError } = await supabase
        .from('profile_photos')
        .delete()
        .eq('id', photoId);

      if (tableError) {
        logError('MyProfile', 'photo_delete_db_failed', tableError);
        throw tableError;
      }

      if (storagePath) {
        await supabase.storage.from('profile-photos').remove([storagePath]);
      }

      const newPhotos = photos.filter(p => p.id !== photoId);
      setPhotos(newPhotos);

      if (profile.avatar_storage_path === storagePath) {
        const nextPhoto = newPhotos.length > 0 ? newPhotos[0] : null;
        const newAvatarPath = nextPhoto ? nextPhoto.storage_path : null;
        const newAvatarUrl = nextPhoto ? nextPhoto.url : null;

        await supabase
          .from('profiles')
          .update({ avatar_storage_path: newAvatarPath })
          .eq('id', profile.id);
        setProfile({ ...profile, avatar_url: newAvatarUrl, avatar_storage_path: newAvatarPath });
      }

    } catch (error) {
      logError('MyProfile', 'photo_delete_exception', error);
      console.error('Error removing photo:', error);
      Alert.alert('שגיאה', 'לא הצלחנו למחוק את התמונה');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading && !profile) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={UI_COLORS.primary} />
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
              <View style={styles.header}>
                <ThemedText style={[styles.title, { color: dynamicColors.text }]}>הפרופיל שלי</ThemedText>
                <TouchableOpacity onPress={handleLogout}>
                   <IconSymbol name="rectangle.portrait.and.arrow.right" size={24} color={UI_COLORS.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.carouselSection}>
                {photos.length > 0 ? (
                  <>
                    <ScrollView
                      ref={carouselRef}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      onMomentumScrollEnd={handleCarouselScrollEnd}
                      scrollEventThrottle={16}
                    >
                      {photos.map((photo) => (
                        <View key={photo.id} style={[styles.carouselCell, { width: CAROUSEL_WIDTH }]}>
                          <View style={[styles.carouselImageWrapper, { borderColor: UI_COLORS.branding }]}>
                            <Image source={{ uri: photo.url }} style={styles.carouselImage} />
                            <TouchableOpacity
                              style={styles.carouselDeleteBadge}
                              onPress={() => removePhoto(photo.id, photo.storage_path)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              activeOpacity={0.7}
                            >
                              <IconSymbol name="xmark" size={14} color="white" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                    {photos.length > 1 && (
                      <View style={styles.dotsRow}>
                        {photos.map((_, idx) => {
                          const activeIndex = Math.min(currentPhotoIndex, photos.length - 1);
                          const isActive = idx === activeIndex;
                          return (
                            <View
                              key={idx}
                              style={[
                                styles.dot,
                                { backgroundColor: dynamicColors.border },
                                isActive && { backgroundColor: UI_COLORS.branding, width: 20 },
                              ]}
                            />
                          );
                        })}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={[styles.carouselCell, { width: CAROUSEL_WIDTH }]}>
                    <TouchableOpacity
                      style={[styles.carouselEmptyCell, { borderColor: dynamicColors.border, backgroundColor: dynamicColors.card }]}
                      onPress={pickImage}
                      disabled={uploading}
                      activeOpacity={0.7}
                    >
                      {uploading ? (
                        <ActivityIndicator size="large" color={UI_COLORS.primary} />
                      ) : (
                        <>
                          <IconSymbol name="camera" size={48} color={dynamicColors.textLight} />
                          <ThemedText style={{ color: dynamicColors.textLight, marginTop: 12, fontSize: 16, fontWeight: '600' }}>
                            הוספת תמונה
                          </ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {photos.length > 0 && (
                  <View style={styles.addPhotoRow}>
                    <TouchableOpacity
                      style={[styles.addPhotoButton, { borderColor: UI_COLORS.primary }]}
                      onPress={pickImage}
                      disabled={uploading}
                      activeOpacity={0.85}
                    >
                      {uploading ? (
                        <ActivityIndicator size="small" color={UI_COLORS.primary} />
                      ) : (
                        <>
                          <IconSymbol name="plus.circle.fill" size={18} color={UI_COLORS.primary} />
                          <ThemedText style={[styles.addPhotoButtonText, { color: UI_COLORS.primary }]}>
                            הוספת תמונה
                          </ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.infoSection}>
                {editing ? (
                  <View style={styles.editForm}>
                    <ThemedText style={[styles.label, { color: dynamicColors.text }]}>שם משתמש</ThemedText>
                    <TextInput
                      style={[styles.input, { backgroundColor: dynamicColors.inputBg, color: dynamicColors.text, borderColor: dynamicColors.border }]}
                      value={username}
                      onChangeText={setUsername}
                      placeholder="שם משתמש"
                      textAlign="right"
                    />
                    
                    <ThemedText style={[styles.label, { color: dynamicColors.text }]}>ביו (קצת עלייך)</ThemedText>
                    <TextInput
                      style={[styles.input, styles.bioInput, { backgroundColor: dynamicColors.inputBg, color: dynamicColors.text, borderColor: dynamicColors.border }]}
                      value={bio}
                      onChangeText={setBio}
                      placeholder="ספרי קצת על עצמך..."
                      multiline
                      textAlign="right"
                    />

                    <View style={styles.editActions}>
                       <TouchableOpacity style={[styles.saveButton, { backgroundColor: UI_COLORS.primary }]} onPress={handleSaveProfile}>
                          <ThemedText style={styles.saveButtonText}>שמירה</ThemedText>
                       </TouchableOpacity>
                       <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)}>
                          <ThemedText style={[styles.cancelButtonText, { color: dynamicColors.textLight }]}>ביטול</ThemedText>
                       </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.displayInfo}>
                    <ThemedText style={[styles.displayName, { color: dynamicColors.text }]}>{profile?.username}</ThemedText>
                    <ThemedText style={[styles.displayFaculty, { color: dynamicColors.textLight }]}>
                       {profile?.faculty} • {profile?.university}
                    </ThemedText>
                    {profile?.bio ? (
                      <ThemedText style={[styles.displayBio, { color: dynamicColors.text }]}>{profile.bio}</ThemedText>
                    ) : (
                      <ThemedText style={[styles.bioPlaceholder, { color: dynamicColors.textLight }]}>עדיין אין ביו... כדאי להוסיף!</ThemedText>
                    )}
                    <TouchableOpacity
                      style={styles.editProfileLinkButton}
                      onPress={() => setEditing(true)}
                      hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={[styles.editProfileLink, { color: UI_COLORS.branding }]}>ערוך פרופיל</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.questionnaireSection}>
                 <View style={styles.sectionHeader}>
                   <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>שאלון ההתאמה שלי</ThemedText>
                   <TouchableOpacity onPress={() => router.push('/questionnaire?mode=edit')}>
                      <ThemedText style={{ color: UI_COLORS.primary, fontWeight: '700' }}>עריכה</ThemedText>
                   </TouchableOpacity>
                 </View>
                 
                 {answers ? (
                   <View style={styles.answersPreview}>
                      <ThemedText style={[styles.answerItem, { color: dynamicColors.text }]}>• מחפש/ת: {labelFor('intent_type', answers.intent_type)}</ThemedText>
                      <ThemedText style={[styles.answerItem, { color: dynamicColors.text }]}>• סגנון תקשורת: {labelFor('conflict_style', answers.conflict_style)}</ThemedText>
                      <ThemedText style={[styles.answerItem, { color: dynamicColors.text }]}>• מפגש ראשון: {labelFor('preferred_first_date', answers.preferred_first_date)}</ThemedText>
                   </View>
                 ) : (
                   <ThemedText style={[styles.onboardingNote, { color: dynamicColors.textLight }]}>
                     עדיין לא מילאת את השאלון.
                   </ThemedText>
                 )}
              </View>

              <View style={styles.settingsSection}>
                <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>הגדרות וחוקיות</ThemedText>
                <View style={[styles.settingsCard, { backgroundColor: dynamicColors.card, borderColor: dynamicColors.border }]}>
                  <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/how-it-works' as any)}>
                    <ThemedText style={[styles.settingsRowText, { color: dynamicColors.text }]}>איך זה עובד?</ThemedText>
                  </TouchableOpacity>
                  <View style={[styles.settingsDivider, { backgroundColor: dynamicColors.border }]} />
                  <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/privacy-policy' as any)}>
                    <ThemedText style={[styles.settingsRowText, { color: dynamicColors.text }]}>מדיניות פרטיות</ThemedText>
                  </TouchableOpacity>
                  <View style={[styles.settingsDivider, { backgroundColor: dynamicColors.border }]} />
                  <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/terms-of-use' as any)}>
                    <ThemedText style={[styles.settingsRowText, { color: dynamicColors.text }]}>תנאי שימוש</ThemedText>
                  </TouchableOpacity>
                  <View style={[styles.settingsDivider, { backgroundColor: dynamicColors.border }]} />
                  <View
                    style={styles.settingsRow}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: true }}
                  >
                    <ThemedText style={[styles.settingsRowText, { color: dynamicColors.textLight }]}>מחיקת חשבון</ThemedText>
                    <View style={[styles.comingSoonBadge, { backgroundColor: dynamicColors.border }]}>
                      <ThemedText style={[styles.comingSoonText, { color: dynamicColors.textLight }]}>בקרוב</ThemedText>
                    </View>
                  </View>
                </View>
              </View>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 32,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'right',
  },
  // Photo carousel (replaces the legacy small avatar + tile grid).
  carouselSection: {
    gap: 16,
    marginTop: 4,
  },
  carouselCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselImageWrapper: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFF0EA',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  carouselDeleteBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselEmptyCell: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addPhotoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  addPhotoButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoSection: {
    gap: 16,
  },
  editForm: {
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: -4,
  },
  input: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    fontSize: 16,
  },
  bioInput: {
    height: 100,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  saveButton: {
    flex: 2,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '800',
  },
  cancelButton: {
    flex: 1,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  displayInfo: {
    alignItems: 'center',
    gap: 8,
  },
  displayName: {
    fontSize: 26,
    fontWeight: '800',
  },
  displayFaculty: {
    fontSize: 16,
    fontWeight: '600',
  },
  displayBio: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 8,
    paddingHorizontal: 10,
  },
  bioPlaceholder: {
    fontSize: 15,
    fontStyle: 'italic',
    marginTop: 8,
  },
  editProfileLinkButton: {
    marginTop: 8,
    paddingVertical: 4,
  },
  editProfileLink: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  questionnaireSection: {
    gap: 16,
    marginTop: 10,
  },
  answersPreview: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  answerItem: {
    fontSize: 15,
    textAlign: 'right',
  },
  onboardingNote: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  settingsSection: {
    gap: 12,
    marginTop: 10,
  },
  settingsCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingsRowText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  settingsDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  comingSoonBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
