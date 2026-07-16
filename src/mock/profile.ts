import { v4 as uuidv4 } from 'uuid';
import type { MasterProfile } from '@/types/schema';

/**
 * Realistic mock MasterProfile for offline development and testing.
 * Based on a Senior Full Stack Developer profile.
 */
export const mockMasterProfile: MasterProfile = {
  profileId: uuidv4(),
  version: 1,
  lastConfirmed: new Date().toISOString(),
  summary: {
    id: uuidv4(),
    title: 'Professional Summary',
    isLocked: false,
    data: 'Senior Full Stack Developer with 7+ years of experience building scalable web applications. Expert in React, TypeScript, Node.js, and cloud-native architectures. Proven track record of leading cross-functional teams and delivering products that serve 2M+ monthly active users. Passionate about clean code, developer experience, and mentoring junior engineers.',
  },
  experience: {
    id: uuidv4(),
    title: 'Work Experience',
    isLocked: false,
    data: [
      {
        id: uuidv4(),
        roleTitle: 'Senior Full Stack Developer',
        companyName: 'TechCorp Solutions',
        startDate: 'Mar 2021',
        endDate: 'Present',
        bullets: [
          {
            id: uuidv4(),
            text: 'Led the migration of a legacy monolith to a microservices architecture using Node.js and Kubernetes, reducing deployment time by 85% and improving system uptime to 99.97%',
            isVerified: true,
          },
          {
            id: uuidv4(),
            text: 'Architected and built a real-time analytics dashboard using React, D3.js, and WebSocket connections, processing 50,000+ events per second',
            isVerified: true,
          },
          {
            id: uuidv4(),
            text: 'Mentored a team of 6 junior developers through code reviews, pair programming sessions, and weekly knowledge-sharing workshops',
            isVerified: true,
          },
          {
            id: uuidv4(),
            text: 'Implemented a CI/CD pipeline using GitHub Actions and Docker, reducing release cycles from 2 weeks to same-day deployments',
            isVerified: true,
          },
        ],
      },
      {
        id: uuidv4(),
        roleTitle: 'Full Stack Developer',
        companyName: 'DataStream Inc.',
        startDate: 'Jun 2018',
        endDate: 'Feb 2021',
        bullets: [
          {
            id: uuidv4(),
            text: 'Built a customer-facing SaaS platform from scratch using React, TypeScript, and PostgreSQL, growing to 15,000 paying users within 18 months',
            isVerified: true,
          },
          {
            id: uuidv4(),
            text: 'Optimized database queries and implemented Redis caching, reducing API response times by 60% and cutting server costs by $4,200/month',
            isVerified: true,
          },
          {
            id: uuidv4(),
            text: 'Designed and implemented a role-based access control (RBAC) system supporting 5 permission tiers across 3 product modules',
            isVerified: true,
          },
        ],
      },
      {
        id: uuidv4(),
        roleTitle: 'Junior Web Developer',
        companyName: 'Creative Digital Agency',
        startDate: 'Jan 2017',
        endDate: 'May 2018',
        bullets: [
          {
            id: uuidv4(),
            text: 'Developed responsive websites for 25+ clients using HTML5, CSS3, JavaScript, and WordPress, maintaining a 98% client satisfaction rate',
            isVerified: true,
          },
          {
            id: uuidv4(),
            text: 'Integrated third-party APIs including Stripe, Mailchimp, and Google Maps into client applications',
            isVerified: true,
          },
        ],
      },
    ],
  },
  skills: {
    id: uuidv4(),
    title: 'Skills',
    isLocked: false,
    data: [
      { id: uuidv4(), name: 'React', category: 'Technical' },
      { id: uuidv4(), name: 'TypeScript', category: 'Technical' },
      { id: uuidv4(), name: 'Node.js', category: 'Technical' },
      { id: uuidv4(), name: 'PostgreSQL', category: 'Technical' },
      { id: uuidv4(), name: 'Kubernetes', category: 'Tools' },
      { id: uuidv4(), name: 'Docker', category: 'Tools' },
      { id: uuidv4(), name: 'AWS', category: 'Tools' },
      { id: uuidv4(), name: 'GitHub Actions', category: 'Tools' },
      { id: uuidv4(), name: 'Redis', category: 'Technical' },
      { id: uuidv4(), name: 'GraphQL', category: 'Technical' },
      { id: uuidv4(), name: 'Python', category: 'Languages' },
      { id: uuidv4(), name: 'Team Leadership', category: 'Soft' },
      { id: uuidv4(), name: 'Mentoring', category: 'Soft' },
      { id: uuidv4(), name: 'Agile/Scrum', category: 'Soft' },
    ],
  },
  education: {
    id: uuidv4(),
    title: 'Education',
    isLocked: false,
    data: [
      {
        id: uuidv4(),
        degree: 'B.Sc. Computer Science',
        institution: 'University of California, Berkeley',
        graduationDate: 'May 2016',
        gpa: '3.7/4.0',
        honors: ['Magna Cum Laude', "Dean's List (6 semesters)"],
      },
    ],
  },
  projects: {
    id: uuidv4(),
    title: 'Projects',
    isLocked: false,
    data: [
      {
        id: uuidv4(),
        name: 'OpenMetrics Dashboard',
        role: 'Creator & Lead Developer',
        url: 'https://github.com/example/openmetrics',
        bullets: [
          {
            id: uuidv4(),
            text: 'Built an open-source monitoring dashboard with React and Prometheus integration, reaching 1,200+ GitHub stars',
            isVerified: true,
          },
          {
            id: uuidv4(),
            text: 'Implemented real-time alerting system with configurable thresholds and Slack/PagerDuty integrations',
            isVerified: true,
          },
        ],
      },
    ],
  },
};
