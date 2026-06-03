import React, { useEffect, useState } from 'react';
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
  TouchableWithoutFeedback,
  Keyboard,
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
  
  // Editable fields
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');

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
      setProfile(profileData);
      setUsername(profileData.username || '');
      setBio(profileData.bio || '');

      const { data: photosData, error: photosError } = await supabase
        .from('profile_photos')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true });

      if (photosError) throw photosError;
      setPhotos(photosData || []);

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

      if (error) throw error;
      
      setProfile({ ...profile, username, bio });
      setEditing(false);
      Alert.alert('הצלחה', 'הפרופיל עודכן בהצלחה');
    } catch (error) {
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

      if (!result.canceled) {
        uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לבחור תמונה');
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);
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

      if (storageError) throw storageError;

      // 3. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      // 4. Save to profile_photos table
      const { data: photoData, error: tableError } = await supabase
        .from('profile_photos')
        .insert({
          user_id: user.id,
          url: publicUrl,
          display_order: photos.length,
        })
        .select()
        .single();

      if (tableError) throw tableError;

      setPhotos([...photos, photoData]);
      
      if (!profile.avatar_url) {
        await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl })
          .eq('id', user.id);
        setProfile({ ...profile, avatar_url: publicUrl });
      }

    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('שגיאה', 'לא הצלחנו להעלות את התמונה');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (photoId: string, photoUrl: string) => {
    try {
      setLoading(true);
      const { error: tableError } = await supabase
        .from('profile_photos')
        .delete()
        .eq('id', photoId);

      if (tableError) throw tableError;

      const filePath = photoUrl.split('profile-photos/')[1];
      if (filePath) {
        await supabase.storage.from('profile-photos').remove([filePath]);
      }

      const newPhotos = photos.filter(p => p.id !== photoId);
      setPhotos(newPhotos);

      if (profile.avatar_url === photoUrl) {
        const newAvatar = newPhotos.length > 0 ? newPhotos[0].url : null;
        await supabase
          .from('profiles')
          .update({ avatar_url: newAvatar })
          .eq('id', profile.id);
        setProfile({ ...profile, avatar_url: newAvatar });
      }

    } catch (error) {
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
          <SafeAreaView style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <ThemedText style={[styles.title, { color: dynamicColors.text }]}>הפרופיל שלי</ThemedText>
                <TouchableOpacity onPress={handleLogout}>
                   <IconSymbol name="rectangle.portrait.and.arrow.right" size={24} color={UI_COLORS.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.avatarContainer}>
                <View style={[styles.avatarFrame, { borderColor: UI_COLORS.branding }]}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <ThemedText style={styles.avatarText}>{(profile?.username || '?')[0]}</ThemedText>
                  )}
                </View>
                {!editing ? (
                  <TouchableOpacity style={styles.editBadge} onPress={() => setEditing(true)}>
                    <IconSymbol name="pencil" size={16} color="white" />
                  </TouchableOpacity>
                ) : null}
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
                  </View>
                )}
              </View>

              <View style={styles.photoSection}>
                <View style={styles.sectionHeader}>
                  <ThemedText style={[styles.sectionTitle, { color: dynamicColors.text }]}>תמונות שלי</ThemedText>
                  <TouchableOpacity onPress={pickImage} disabled={uploading}>
                    {uploading ? <ActivityIndicator size="small" color={UI_COLORS.primary} /> : <IconSymbol name="plus.circle.fill" size={24} color={UI_COLORS.primary} />}
                  </TouchableOpacity>
                </View>
                
                <View style={styles.photoGrid}>
                  {photos.map((photo) => (
                    <View key={photo.id} style={styles.photoWrapper}>
                      <Image source={{ uri: photo.url }} style={styles.gridPhoto} />
                      <TouchableOpacity style={styles.deletePhotoBadge} onPress={() => removePhoto(photo.id, photo.url)}>
                         <IconSymbol name="xmark" size={12} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {photos.length === 0 && !uploading && (
                    <TouchableOpacity style={[styles.addPhotoPlaceholder, { borderColor: dynamicColors.border }]} onPress={pickImage}>
                       <IconSymbol name="camera" size={32} color={dynamicColors.textLight} />
                       <ThemedText style={{ color: dynamicColors.textLight, marginTop: 8 }}>הוספת תמונה</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
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
                      <ThemedText style={[styles.answerItem, { color: dynamicColors.text }]}>• מחפש/ת: {Array.isArray(answers.intent) ? answers.intent.join(', ') : answers.intent}</ThemedText>
                      <ThemedText style={[styles.answerItem, { color: dynamicColors.text }]}>• סגנון תקשורת: {answers.communicationStyle}</ThemedText>
                      <ThemedText style={[styles.answerItem, { color: dynamicColors.text }]}>• מפגש ראשון: {answers.meetingStyle}</ThemedText>
                   </View>
                 ) : (
                   <ThemedText style={[styles.onboardingNote, { color: dynamicColors.textLight }]}>
                     עדיין לא מילאת את השאלון.
                   </ThemedText>
                 )}
              </View>
            </ScrollView>
          </SafeAreaView>
        </ThemedView>
      </TouchableWithoutFeedback>
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
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  avatarContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  avatarFrame: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF0EA',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FF3D57',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: '35%',
    backgroundColor: '#FF3D57',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
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
    flexDirection: 'row-reverse',
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
  photoSection: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  photoGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoWrapper: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gridPhoto: {
    width: '100%',
    height: '100%',
  },
  deletePhotoBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoPlaceholder: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
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
});
