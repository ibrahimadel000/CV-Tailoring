import { v4 as uuidv4 } from 'uuid';
import type { CVProfile, MasterProfile } from '@/types/schema';

/**
 * Realistic mock MasterProfile / CVProfile for offline development, onboarding, and testing.
 * Based on a Senior Full Stack Developer profile.
 */
export function createSampleProfile(name: string = 'Alex Morgan (Sample CV)'): CVProfile {
  return {
    profileId: uuidv4(),
    profileName: name,
    version: 1,
    lastConfirmed: new Date().toISOString(),
    resumeHeader: {
      id: uuidv4(),
      title: 'Resume Header',
      isLocked: false,
      data: {
        name: 'Alex Morgan',
        firstName: 'Alex',
        lastName: 'Morgan',
        desiredJobPosition: 'Senior Full Stack Engineer',
        useAsHeadline: true,
        email: 'alex.morgan@example.com',
        phone: '+1 (555) 234-5678',
        location: 'San Francisco, CA',
        linkedin: 'linkedin.com/in/alexmorgan-dev',
        github: 'github.com/alexmorgan',
        portfolio: 'alexmorgan.dev',
        showLocation: true,
        showPhone: true,
        showLinkedin: true,
        showGithub: true,
        showPortfolio: true,
        showSuffixName: false,
        showOtherUrl: false,
      },
    },
    headline: {
      id: uuidv4(),
      title: 'Headline',
      isLocked: false,
      data: 'Senior Full Stack Engineer | React, TypeScript & Node.js Cloud Architect',
    },
    summary: {
      id: uuidv4(),
      title: 'Professional Summary',
      isLocked: false,
      data: 'Senior Full Stack Developer with 7+ years of experience building high-traffic cloud web applications. Expert in React, TypeScript, Node.js, and Kubernetes architectures. Proven track record of leading cross-functional teams and delivering products that serve 2M+ monthly active users with 99.97% uptime. Passionate about clean code, developer experience, and mentoring engineering talent.',
    },
    experience: {
      id: uuidv4(),
      title: 'Work Experience',
      isLocked: false,
      data: [
        {
          id: uuidv4(),
          roleTitle: 'Senior Full Stack Engineer',
          companyName: 'TechCorp Solutions',
          city: 'San Francisco, CA',
          startDate: 'Mar 2021',
          endDate: 'Present',
          bullets: [
            {
              id: uuidv4(),
              text: 'Led the migration of a legacy monolith to microservices using Node.js, Go, and Kubernetes, reducing deployment time by 85% and improving uptime to 99.97%.',
              isVerified: true,
            },
            {
              id: uuidv4(),
              text: 'Architected and built a real-time collaborative dashboard using React 18, WebSockets, and Redis, processing 50,000+ streaming events per second.',
              isVerified: true,
            },
            {
              id: uuidv4(),
              text: 'Mentored a team of 6 engineers through structured code reviews, pair programming, and weekly architecture workshops.',
              isVerified: true,
            },
            {
              id: uuidv4(),
              text: 'Implemented end-to-end CI/CD pipelines with GitHub Actions and Docker, reducing release cycles from 2 weeks to automated daily deploys.',
              isVerified: true,
            },
          ],
        },
        {
          id: uuidv4(),
          roleTitle: 'Full Stack Developer',
          companyName: 'DataStream Inc.',
          city: 'San Jose, CA',
          startDate: 'Jun 2018',
          endDate: 'Feb 2021',
          bullets: [
            {
              id: uuidv4(),
              text: 'Built customer-facing SaaS web app from scratch using React, TypeScript, and PostgreSQL, scaling to 15,000 paying users within 18 months.',
              isVerified: true,
            },
            {
              id: uuidv4(),
              text: 'Optimized PostgreSQL queries, index strategies, and Redis caching layers, cutting 95th percentile API response times by 60%.',
              isVerified: true,
            },
            {
              id: uuidv4(),
              text: 'Designed secure role-based access control (RBAC) supporting enterprise SSO (SAML & OAuth2) across 3 distinct product tiers.',
              isVerified: true,
            },
          ],
        },
        {
          id: uuidv4(),
          roleTitle: 'Junior Web Developer',
          companyName: 'Creative Digital Agency',
          city: 'Oakland, CA',
          startDate: 'Jan 2017',
          endDate: 'May 2018',
          bullets: [
            {
              id: uuidv4(),
              text: 'Developed accessible, responsive web applications for 20+ clients using HTML5, modern CSS, JavaScript, and REST APIs.',
              isVerified: true,
            },
            {
              id: uuidv4(),
              text: 'Integrated third-party payment gateways (Stripe) and CRM webhooks, ensuring 99.9% billing transaction accuracy.',
              isVerified: true,
            },
          ],
        },
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
          city: 'Berkeley, CA',
          startDate: '2013',
          endDate: '2016',
          graduationDate: 'May 2016',
          gpa: '3.8/4.0',
          honors: ['Magna Cum Laude', "Dean's Honor List"],
        },
      ],
    },
    certifications: {
      id: uuidv4(),
      title: 'Certifications',
      isLocked: false,
      data: [
        {
          id: uuidv4(),
          name: 'AWS Certified Solutions Architect – Associate',
          issuer: 'Amazon Web Services',
          date: '2023 - 2026',
        },
        {
          id: uuidv4(),
          name: 'Certified Kubernetes Application Developer (CKAD)',
          issuer: 'Cloud Native Computing Foundation (CNCF)',
          date: '2022 - 2025',
        },
      ],
    },
    projects: {
      id: uuidv4(),
      title: 'Projects & Outside Experience',
      isLocked: false,
      data: [
        {
          id: uuidv4(),
          name: 'OpenMetrics Dashboard',
          role: 'Creator & Maintainer',
          url: 'https://github.com/example/openmetrics',
          bullets: [
            {
              id: uuidv4(),
              text: 'Created an open-source performance monitoring tool with React, Vite, and Prometheus API, earning 1,400+ stars on GitHub.',
              isVerified: true,
            },
            {
              id: uuidv4(),
              text: 'Implemented custom anomaly-detection charts and webhook alerting for Slack and PagerDuty.',
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
        { id: uuidv4(), name: 'Next.js', category: 'Technical' },
        { id: uuidv4(), name: 'PostgreSQL', category: 'Technical' },
        { id: uuidv4(), name: 'Redis', category: 'Technical' },
        { id: uuidv4(), name: 'GraphQL', category: 'Technical' },
        { id: uuidv4(), name: 'Python', category: 'Languages' },
        { id: uuidv4(), name: 'Docker', category: 'Tools' },
        { id: uuidv4(), name: 'Kubernetes', category: 'Tools' },
        { id: uuidv4(), name: 'AWS', category: 'Tools' },
        { id: uuidv4(), name: 'GitHub Actions', category: 'Tools' },
        { id: uuidv4(), name: 'System Architecture', category: 'Soft' },
        { id: uuidv4(), name: 'Technical Leadership', category: 'Soft' },
        { id: uuidv4(), name: 'Agile & Scrum', category: 'Soft' },
      ],
    },
  };
}

export const mockMasterProfile: MasterProfile = createSampleProfile('Sample Master Profile');
