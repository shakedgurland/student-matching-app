import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

export default function BasicQuestionnaireScreen() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    intent: '',
    field_of_study: '',
    year_of_study: '',
    interests: '',
    lifestyle: '',
    communication_style: '',
    values: '',
    looking_for: '',
  });

  const handleSave = async () => {
    if (!form.intent || !form.field_of_study || !form.looking_for) {
      Alert.alert('שימי לב', 'אנא מלאי את שדות החובה כדי שנוכל להתחיל בהתאמה');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        Alert.alert('שגיאה', 'משתמש לא מחובר');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          ...form,
          updated_at: new Date(),
          questionnaire_step: 1
        });

      if (error) {
        console.warn('Supabase error:', error.message);
      }

      router.push('/questionnaire-transition');
    } catch (err) {
      console.error(err);
      router.push('/questionnaire-transition');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveContainer useSafeArea={false}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>UniMatch</Text>
        <Text style={styles.title}>שאלון בסיסי</Text>
        <Text style={styles.subtitle}>בואי נתחיל מהדברים החשובים באמת</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>מה כוונת הקשר שאת/ה מחפש/ת? *</Text>
          <TextInput 
            style={styles.input} 
            placeholder="קשר רציני / היכרות קלילה / חברים ללימודים..." 
            value={form.intent}
            onChangeText={(val) => setForm({...form, intent: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>תחום לימודים וקמפוס *</Text>
          <TextInput 
            style={styles.input} 
            placeholder="לדוגמה: פסיכולוגיה, הר הצופים" 
            value={form.field_of_study}
            onChangeText={(val) => setForm({...form, field_of_study: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>שנת לימודים / גיל</Text>
          <TextInput 
            style={styles.input} 
            placeholder="א׳, ב׳, גיל..." 
            value={form.year_of_study}
            onChangeText={(val) => setForm({...form, year_of_study: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>תחומי עניין עיקריים</Text>
          <TextInput 
            style={styles.input} 
            placeholder="מוזיקה, טיולים, ספרים, ספורט..." 
            value={form.interests}
            onChangeText={(val) => setForm({...form, interests: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>סגנון חיים</Text>
          <TextInput 
            style={styles.input} 
            placeholder="בוקר / לילה, טבע / עיר..." 
            value={form.lifestyle}
            onChangeText={(val) => setForm({...form, lifestyle: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>סגנון תקשורת מועדף</Text>
          <TextInput 
            style={styles.input} 
            placeholder="שיחות טלפון, הודעות, פנים אל פנים..." 
            value={form.communication_style}
            onChangeText={(val) => setForm({...form, communication_style: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>ערכים שחשובים לך</Text>
          <TextInput 
            style={styles.input} 
            placeholder="כנות, משפחתיות, חופש, למידה..." 
            value={form.values}
            onChangeText={(val) => setForm({...form, values: val})}
            textAlign="right"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>מה את/ה מחפש/ת באדם השני? *</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            placeholder="תכונות אופי, תחומי עניין משותפים..." 
            multiline
            value={form.looking_for}
            onChangeText={(val) => setForm({...form, looking_for: val})}
            textAlign="right"
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? 'שומר...' : 'המשך להתאמות ראשוניות'}
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
