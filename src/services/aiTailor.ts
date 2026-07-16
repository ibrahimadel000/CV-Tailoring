import { GoogleGenerativeAI } from '@google/generative-ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { parseAIResponse } from './aiResponseCleaner';
import { aiTailoredResponseSchema } from '@/types/schema';
import type { CVProfile, AITailoredResponse } from '@/types/schema';

// Initialize Gemini SDK
// Note: In production, this call must move to a secure backend proxy to protect the API key.
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || 'MISSING_API_KEY');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Convert our Zod schema into the OpenAPI-style JSON schema expected by Gemini Structured Outputs
const jsonSchemaForGemini = zodToJsonSchema(aiTailoredResponseSchema, "TailoredResponse").definitions!.TailoredResponse;

export async function tailorProfile(
  profile: CVProfile,
  jobDescription: string
): Promise<AITailoredResponse> {
  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY is not set in the environment.');
  }

  // Create a strict JSON representation of the master profile
  // We only send the minimum data needed so the AI doesn't get confused
  const payload = {
    summary: profile.summary.data,
    skills: profile.skills.data.map(s => s.name),
    experience: profile.experience.data.map(exp => ({
      id: exp.id,
      title: exp.roleTitle,
      company: exp.companyName,
      bullets: exp.bullets.map(b => ({
        id: b.id,
        text: b.text
      }))
    })),
    projects: profile.projects.data.map(proj => ({
      id: proj.id,
      name: proj.name,
      bullets: proj.bullets.map(b => ({
        id: b.id,
        text: b.text
      }))
    }))
  };

  const prompt = `
You are a world-class executive resume writer. Your job is to tailor a candidate's master profile to perfectly match a target job description.

CRITICAL INSTRUCTIONS (ZERO HALLUCINATION STRICT RULE):
1. You may ONLY select, reorder, and rephrase existing bullet points from the master profile.
2. You are FORBIDDEN from inventing new companies, new job titles, new metrics, or new skills not found in the original bullets.
3. You must rewrite the selected bullets to naturally incorporate keywords from the job description, while preserving the original meaning and metrics exactly.
4. Do NOT include experience entries or bullets that are irrelevant to the job description.
5. Provide a tailored summary reflecting the candidate's fit for this specific role.
6. Identify key skills required by the job description that the candidate is missing (honest gap analysis).

Master Profile:
${JSON.stringify(payload, null, 2)}

Target Job Description:
${jobDescription}

You must return your response strictly matching the required JSON schema.
  `;

  let lastError = null;
  const MAX_RETRIES = 2;

  // Retry loop in case the LLM garbles the JSON despite Structured Outputs
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          // Note: gemini requires specific JSON schema format, we cast it to any to bypass 
          // strict typing mismatches between zod-to-json-schema and google's SDK types
          responseSchema: jsonSchemaForGemini as any, 
          temperature: 0.2, // Low temperature for high adherence
        },
      });

      const rawText = result.response.text();
      const parsedData = parseAIResponse(rawText, aiTailoredResponseSchema);
      
      return parsedData;
      
    } catch (err: any) {
      console.warn(`AI generation attempt ${attempt} failed:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`Failed to generate tailored profile after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`);
}
