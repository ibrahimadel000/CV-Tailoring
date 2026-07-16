import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { CVProfile } from '@/types/schema';

// Standard ATS-friendly styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.4,
  },
  header: {
    marginBottom: 20,
    borderBottom: '1px solid #E5E7EB',
    paddingBottom: 10,
  },
  name: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 4,
    color: '#111827',
  },
  contact: {
    fontSize: 9,
    color: '#4B5563',
    flexDirection: 'row',
    gap: 10,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#111827',
    textTransform: 'uppercase',
    marginBottom: 8,
    borderBottom: '1px solid #E5E7EB',
    paddingBottom: 2,
  },
  summary: {
    marginBottom: 16,
    textAlign: 'justify',
  },
  itemBlock: {
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  itemTitle: {
    fontWeight: 700,
    fontSize: 11,
  },
  itemSubtitle: {
    fontWeight: 500,
    color: '#374151',
  },
  itemDate: {
    fontSize: 9,
    color: '#6B7280',
  },
  bulletList: {
    marginTop: 4,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 4,
  },
  bulletPoint: {
    width: 10,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    textAlign: 'justify',
  },
  skillsGroup: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  skillCategory: {
    fontWeight: 700,
    width: 70,
  },
  skillList: {
    flex: 1,
  }
});

interface Props {
  profile: CVProfile;
  name: string;
  email: string;
  phone: string;
  linkedin: string;
}

export function ResumePDFTemplate({ profile, name, email, phone, linkedin }: Props) {
  
  // Simple hardcoded skills extraction for now
  const techSkills = profile.skills.data.filter(s => s.category === 'Technical').map(s => s.name).join(', ');
  const toolSkills = profile.skills.data.filter(s => s.category === 'Tools').map(s => s.name).join(', ');
  const softSkills = profile.skills.data.filter(s => s.category === 'Soft').map(s => s.name).join(', ');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{name}</Text>
          <View style={styles.contact}>
            {email && <Text>{email}</Text>}
            {phone && <Text>• {phone}</Text>}
            {linkedin && <Text>• {linkedin}</Text>}
          </View>
        </View>

        {/* Summary */}
        {profile.summary.data && (
          <View style={styles.summary}>
            <Text>{profile.summary.data}</Text>
          </View>
        )}

        {/* Experience */}
        {profile.experience.data.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {profile.experience.data.map((exp, i) => (
              <View key={i} style={styles.itemBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{exp.roleTitle}</Text>
                  <Text style={styles.itemDate}>{exp.startDate} - {exp.endDate}</Text>
                </View>
                <Text style={styles.itemSubtitle}>{exp.companyName}</Text>
                <View style={styles.bulletList}>
                  {exp.bullets.filter(b => b.text.trim()).map((bullet, j) => (
                    <View key={j} style={styles.bullet}>
                      <Text style={styles.bulletPoint}>•</Text>
                      <Text style={styles.bulletText}>{bullet.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {profile.projects.data.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {profile.projects.data.map((proj, i) => (
              <View key={i} style={styles.itemBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{proj.name}</Text>
                </View>
                {proj.role && <Text style={styles.itemSubtitle}>{proj.role}</Text>}
                <View style={styles.bulletList}>
                  {proj.bullets.filter(b => b.text.trim()).map((bullet, j) => (
                    <View key={j} style={styles.bullet}>
                      <Text style={styles.bulletPoint}>•</Text>
                      <Text style={styles.bulletText}>{bullet.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {profile.education.data.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {profile.education.data.map((edu, i) => (
              <View key={i} style={styles.itemBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{edu.degree}</Text>
                  <Text style={styles.itemDate}>{edu.graduationDate}</Text>
                </View>
                <Text style={styles.itemSubtitle}>{edu.institution}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {(techSkills || toolSkills || softSkills) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {techSkills && (
              <View style={styles.skillsGroup}>
                <Text style={styles.skillCategory}>Technical:</Text>
                <Text style={styles.skillList}>{techSkills}</Text>
              </View>
            )}
            {toolSkills && (
              <View style={styles.skillsGroup}>
                <Text style={styles.skillCategory}>Tools:</Text>
                <Text style={styles.skillList}>{toolSkills}</Text>
              </View>
            )}
            {softSkills && (
              <View style={styles.skillsGroup}>
                <Text style={styles.skillCategory}>Soft Skills:</Text>
                <Text style={styles.skillList}>{softSkills}</Text>
              </View>
            )}
          </View>
        )}

      </Page>
    </Document>
  );
}
