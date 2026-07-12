import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import {
  getApiKeysFromCredentials,
} from '@/lib/api-key-rotation';

interface CompanyOwnerLookupResult {
  success: boolean;
  ownerName?: string;
  error?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export class OpenAIService {
  private openai: OpenAI;

  constructor(apiKeyOrKeys?: string | string[]) {
    const apiKey = Array.isArray(apiKeyOrKeys)
      ? String(apiKeyOrKeys[0] || '').trim()
      : String(apiKeyOrKeys || '').trim();

    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  /**
   * Lookup company owner using OpenAI
   * @param companyName - The name of the company to lookup
   * @returns Promise with owner name or error
   */
  async lookupCompanyOwner(companyName: string): Promise<CompanyOwnerLookupResult> {
    try {
      console.log(`🔍 Looking up owner for company: ${companyName} using OpenAI`);

      const prompt = `You are a business intelligence expert specializing in company ownership research. Find the current owner, founder, CEO, or primary decision maker for this company.

Company: "${companyName}"

INSTRUCTIONS:
1. Search your knowledge for the ACTUAL REAL owner, founder, or CEO name
2. Only return REAL PERSON NAMES (like "John Smith", "Sarah Johnson")
3. Do NOT make up names or use company names as owner names
4. Do NOT return generic titles or roles
5. If you don't know the real owner, return null

STRICT RULES:
- ONLY return real human names you are confident about
- NEVER return company names as owner names
- NEVER return generic roles like "CEO" or "Founder" without a real name
- NEVER guess or make up names
- If unsure, return null

Respond ONLY in this JSON format:
{
  "ownerName": "Real Person Name" OR null,
  "confidence": "high|medium|low"
}

GOOD Examples:
- "Microsoft" → "Satya Nadella" (real CEO name)
- "Tesla" → "Elon Musk" (real owner name)
- "Meta" → "Mark Zuckerberg" (real founder name)

BAD Examples (NEVER do this):
- "TechBrains (CEO)" ❌
- "Manufacturing Software" ❌  
- "App Development USA" ❌
- "Company Owner" ❌

If you don't know the real person's name, use null.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful business intelligence assistant that provides accurate information about company ownership. Always respond in valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0
      });

      const response = completion.choices[0]?.message?.content;

      if (!response) {
        return {
          success: false,
          error: 'No response from OpenAI'
        };
      }

      try {
        let cleanResponse = response.trim();
        if (cleanResponse.startsWith('```json')) {
          cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanResponse.startsWith('```')) {
          cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(cleanResponse);

        if (parsed.ownerName && parsed.ownerName !== null) {
          console.log(`✅ Found owner for ${companyName}: ${parsed.ownerName} (confidence: ${parsed.confidence})`);
          return {
            success: true,
            ownerName: parsed.ownerName,
            confidence: parsed.confidence || 'medium'
          };
        } else {
          console.log(`❌ No specific owner found for ${companyName}, leaving blank`);
          return {
            success: false,
            error: 'No real owner name found'
          };
        }
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError);
        return {
          success: false,
          error: 'Failed to parse OpenAI response'
        };
      }
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      return {
        success: false,
        error: error.message || 'OpenAI API request failed'
      };
    }
  }

  /**
   * Batch lookup multiple company owners
   */
  async batchLookupCompanyOwners(companyNames: string[]): Promise<Array<{ company: string, result: CompanyOwnerLookupResult }>> {
    const results: Array<{ company: string, result: CompanyOwnerLookupResult }> = [];

    console.log(`🔍 Starting batch lookup for ${companyNames.length} companies`);

    const batchSize = 5;
    for (let i = 0; i < companyNames.length; i += batchSize) {
      const batch = companyNames.slice(i, i + batchSize);

      const batchPromises = batch.map(async (companyName) => {
        const result = await this.lookupCompanyOwner(companyName);
        return { company: companyName, result };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < companyNames.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Batch lookup completed. Found owners for ${results.filter(r => r.result.success).length}/${companyNames.length} companies`);

    return results;
  }
}

/**
 * Create OpenAI service instance with user credentials
 */
export async function createOpenAIServiceForUser(userId: string): Promise<OpenAIService | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentials: true }
    });

    const openaiKeys = getApiKeysFromCredentials(
      (user?.credentials as Record<string, any>) || {},
      'OPENAI_API_KEY',
      'OPENAI_ACCOUNTS'
    );

    if (openaiKeys.length === 0) {
      console.error(`❌ OpenAI API key not found for user ${userId}`);
      return null;
    }

    return new OpenAIService(openaiKeys[0]);
  } catch (error) {
    console.error('Error creating OpenAI service for user:', error);
    return null;
  }
}

export default OpenAIService;
