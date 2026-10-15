import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { CVProfile } from '@/types/schema';

// Standard ATS-friendly styles
const styles = StyleSheet.create({
  page: {
    padding: 44,
    fontSize: 10.5,
    color: '#111827',
    lineHeight: 1.55,
  },
  header: {
    marginBottom: 22,
    borderBottom: '1px solid #E5E7EB',
    paddingBottom: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 4,
    color: '#111827',
  },
  contact: {
    fontSize: 9.5,
    color: '#4B5563',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: 700,
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    borderBottom: '1px solid #E5E7EB',
    paddingBottom: 3,
  },
  summary: {
    marginBottom: 20,
    textAlign: 'justify',
    lineHeight: 1.6,
  },
  itemBlock: {
    marginBottom: 14,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  itemTitle: {
    fontWeight: 700,
    fontSize: 11.5,
    color: '#111827',
  },
  itemSubtitle: {
    fontWeight: 500,
    color: '#374151',
    fontSize: 10.5,
  },
  itemDate: {
    fontSize: 9.5,
    color: '#6B7280',
  },
  bulletList: {
    marginTop: 5,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 3.5,
    paddingLeft: 4,
  },
  bulletPoint: {
    width: 10,
    fontSize: 10,
    color: '#6B7280',
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.55,
    color: '#374151',
    textAlign: 'justify',
  },
  skillsGroup: {
    flexDirection: 'row',
    marginBottom: 6,
    fontSize: 10,
  },
  skillCategory: {
    fontWeight: 700,
    width: 75,
    color: '#111827',
  },
  skillList: {
    flex: 1,
    color: '#374151',
    lineHeight: 1.5,
  }
});

interface Props {
  profile: CVProfile;
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  location?: string;
  github?: string;
  accentColor?: string;
}

export function ResumePDFTemplate({ profile, name, email, phone, linkedin, location, github, accentColor = '#b87373' }: Props) {
  
  // Categorized skills extraction
  const techSkills = profile.skills.data.filter(s => s.category === 'Technical').map(s => s.name).join(', ');
  const toolSkills = profile.skills.data.filter(s => s.category === 'Tools').map(s => s.name).join(', ');
  const softSkills = profile.skills.data.filter(s => s.category === 'Soft').map(s => s.name).join(', ');
  const langSkills = profile.skills.data.filter(s => s.category === 'Languages').map(s => s.name).join(', ');

  const contactItems = [
    email,
    phone,
    location || profile.resumeHeader.data.location,
    linkedin,
    github || profile.resumeHeader.data.github
  ].filter(Boolean);

  const customSectionTitle = {
    ...styles.sectionTitle,
    color: accentColor,
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Document Top Title */}
        <Text style={{ fontSize: 18, fontWeight: 700, color: accentColor, textAlign: 'center', textTransform: 'uppercase', marginBottom: 14 }}>
          Resume
        </Text>

        {/* Header / Personal details */}
        <View style={styles.header}>
          <Text style={customSectionTitle}>Personal details</Text>
          <Text style={styles.name}>{name}</Text>
          {profile.resumeHeader.data.useAsHeadline && profile.resumeHeader.data.desiredJobPosition && (
            <Text style={{ fontSize: 12, color: '#4B5563', marginBottom: 6, fontWeight: 500 }}>
              {profile.resumeHeader.data.desiredJobPosition}
            </Text>
          )}
          <View style={styles.contact}>
            {contactItems.map((item, idx) => (
              <Text key={idx}>{idx > 0 ? `•  ${item}` : item}</Text>
            ))}
          </View>
        </View>

        {/* Summary */}
        {profile.summary.data && (
          <View style={styles.summary}>
            <Text style={customSectionTitle}>Profile</Text>
            <Text>{profile.summary.data}</Text>
          </View>
        )}

        {/* Education */}
        {profile.education.data.length > 0 && (
          <View style={styles.section}>
            <Text style={customSectionTitle}>Education</Text>
            {profile.education.data.map((edu, i) => (
              <View key={i} style={styles.itemBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{edu.degree}</Text>
                  <Text style={styles.itemDate}>
                    {edu.startDate && edu.endDate 
                      ? `${edu.startDate} - ${edu.endDate}` 
                      : (edu.graduationDate || '')}
                  </Text>
                </View>
                <Text style={styles.itemSubtitle}>
                  {edu.institution}{edu.city ? `, ${edu.city}` : ''}
                </Text>
                {edu.description && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ textAlign: 'justify' }}>{edu.description}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Experience */}
        {profile.experience.data.length > 0 && (
          <View style={styles.section}>
            <Text style={customSectionTitle}>Employment</Text>
            {profile.experience.data.map((exp, i) => (
              <View key={i} style={styles.itemBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{exp.roleTitle}</Text>
                  <Text style={styles.itemDate}>
                    {[exp.startDate, exp.endDate].filter(Boolean).join(' - ')}
                  </Text>
                </View>
                <Text style={styles.itemSubtitle}>
                  {exp.companyName}{exp.city ? `, ${exp.city}` : ''}
                </Text>
                {exp.description ? (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ textAlign: 'justify' }}>{exp.description}</Text>
                  </View>
                ) : (
                  <View style={styles.bulletList}>
                    {exp.bullets.filter(b => b.text.trim()).map((bullet, j) => (
                      <View key={j} style={styles.bullet}>
                        <Text style={styles.bulletPoint}>•</Text>
                        <Text style={styles.bulletText}>{bullet.text}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {(techSkills || toolSkills || softSkills || langSkills) && (
          <View style={styles.section}>
            <Text style={customSectionTitle}>Skills</Text>
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
            {langSkills && (
              <View style={styles.skillsGroup}>
                <Text style={styles.skillCategory}>Languages:</Text>
                <Text style={styles.skillList}>{langSkills}</Text>
              </View>
            )}
          </View>
        )}

        {/* Projects */}
        {profile.projects.data.length > 0 && (
          <View style={styles.section}>
            <Text style={customSectionTitle}>Projects</Text>
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

        {/* Certifications */}
        {profile.certifications && profile.certifications.data.length > 0 && (
          <View style={styles.section}>
            <Text style={customSectionTitle}>Certifications</Text>
            {profile.certifications.data.map((cert, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Text style={{ fontWeight: 700, fontSize: 10 }}>{cert.name}</Text>
                  {cert.issuer && <Text style={{ color: '#4B5563', fontSize: 10 }}>— {cert.issuer}</Text>}
                </View>
                {cert.date && <Text style={{ fontSize: 9, color: '#6B7280' }}>{cert.date}</Text>}
              </View>
            ))}
          </View>
        )}

      </Page>
    </Document>
  );
}
