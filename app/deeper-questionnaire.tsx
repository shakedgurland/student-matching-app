import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

export default function DeeperQuestionnaireScreen() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    hobbies: '',
    music_taste: '',
    ideal_date: '',
    personality_traits: '',
    long_term_goals: '',
    deal_breakers: '',
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          ...form,
          questionnaire_step: 2,
          updated_at: new Date(),
        })
        .eq('id', user.id);

      if (error) console.warn('Supabase update error:', error.message);

      Alert.alert('איזה יופי!', 'שאלון העומק הושלם. עכשיו ההתאמות שלך יהיו הרבה יותר מדויקות.', [
        { text: 'מעולה', onPress: () => router.replace('/(tabs)/explore') }
      ]);
    } catch (err) {
      console.error(err);
      router.replace('/(tabs)/explore');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveContainer useSafeArea={false}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>UniMatch</Text>
        <Text style={styles.title}>שאלון עומק</Text>
        <Text style={styles.subtitle}>כדי שנוכל למצוא לך את ההתאמה המדויקת ביותר</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>איך נראה הדייט האידיאלי בעינייך?</Text>
          <TextInput 
            style={styles.input} 
            placeholder="לדוגמה: הופעה חיה, פיקניק שקט, סיבוב ברים..." 
            value={form.ideal_date}
            onChangeText={(val) => setForm({...form, ideal_date: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>ספרי קצת על התחביבים שלך</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            placeholder="מה את אוהבת לעשות בזמן הפנוי?" 
            multiline
            value={form.hobbies}
            onChangeText={(val) => setForm({...form, hobbies: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>איזו מוזיקה את/ה אוהב/ת?</Text>
          <TextInput 
            style={styles.input} 
            placeholder="רוק, פופ, היפ הופ, קלאסי..." 
            value={form.music_taste}
            onChangeText={(val) => setForm({...form, music_taste: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>מהן התכונות שהכי מאפיינות אותך?</Text>
          <TextInput 
            style={styles.input} 
            placeholder="לדוגמה: מופנמת, הרפתקן, יצירתי..." 
            value={form.personality_traits}
            onChangeText={(val) => setForm({...form, personality_traits: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>מה השאיפות שלך לעתיד הקרוב/רחוק?</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            placeholder="לימודים, קריירה, משפחה, טיולים..." 
            multiline
            value={form.long_term_goals}
            onChangeText={(val) => setForm({...form, long_term_goals: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>יש "קוים אדומים" שחשוב שנכיר?</Text>
          <TextInput 
            style={styles.input} 
            placeholder="דברים שלא היית רוצה למצוא בבן/בת הזוג" 
            value={form.deal_breakers}
            onChangeText={(val) => setForm({...form, deal_breakers: val})}
            textAlign="right"
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'שומר...' : 'סיום ושדרוג התאמות'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    flexGrow: 1,
    paddingTop: 40,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#477D9B',
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    color: '#111111',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666666',
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'right',
    color: '#333333',
  },
  input: {
    backgroundColor: '#F4F4F4',
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: '#477D9B',
    padding: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
