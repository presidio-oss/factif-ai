import * as fs from 'fs';
import * as path from 'path';

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface CostRecord {
  testcaseId: string;
  timestamp: string;
  model: string;
  tokenUsage: TokenUsage;
  cost: number;
}

// Cost per 1K tokens for different models (in USD)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4-vision-preview': {
    input: 0.01,
    output: 0.03
  },
  'gpt-4': {
    input: 0.03,
    output: 0.06
  },
  'gpt-4o-2024-11-20': {
    input: 0.01,
    output: 0.03
  },
  'gpt-3.5-turbo': {
    input: 0.0005,
    output: 0.0015
  },
  'gpt-4.1': {
    input: 0.0004,
    output: 0.0016
  },
  'claude-3-opus-20240229': {
    input: 0.015,
    output: 0.075
  },
  'claude-3-sonnet-20240229': {
    input: 0.003,
    output: 0.015
  },
  'claude-3-7-sonnet-20250219': {
    input: 0.003,
    output: 0.015
  },
  'gemini-2.0-flash': {
    input: 0.0001,
    output: 0.0007
  }
};

export class CostTracker {
  private static readonly COSTS_DIR = path.join(process.cwd(), 'costs');
  private static readonly COSTS_FILE = path.join(CostTracker.COSTS_DIR, 'llm-costs.json');

  private static ensureCostsDirectory() {
    if (!fs.existsSync(CostTracker.COSTS_DIR)) {
      fs.mkdirSync(CostTracker.COSTS_DIR, { recursive: true });
    }
    if (!fs.existsSync(CostTracker.COSTS_FILE)) {
      fs.writeFileSync(CostTracker.COSTS_FILE, '[]');
    }
  }

  private static calculateCost(model: string, tokenUsage: TokenUsage): number {
    const modelCosts = MODEL_COSTS[model];
    if (!modelCosts) {
      console.warn(`No cost configuration for model: ${model}`);
      return 0;
    }

    const inputCost = (tokenUsage.prompt_tokens / 1000) * modelCosts.input;
    const outputCost = (tokenUsage.completion_tokens / 1000) * modelCosts.output;

    return Number((inputCost + outputCost).toFixed(6));
  }

  static recordCost(testcaseId: string, model: string, tokenUsage: TokenUsage) {
    try {
      CostTracker.ensureCostsDirectory();

      const cost = CostTracker.calculateCost(model, tokenUsage);
      const record: CostRecord = {
        testcaseId,
        timestamp: new Date().toISOString(),
        model,
        tokenUsage,
        cost
      };

      const records = JSON.parse(fs.readFileSync(CostTracker.COSTS_FILE, 'utf-8'));
      records.push(record);
      fs.writeFileSync(CostTracker.COSTS_FILE, JSON.stringify(records, null, 2));

      return cost;
    } catch (error) {
      console.error('Error recording cost:', error);
      return 0;
    }
  }

  static getTestcaseCosts(testcaseId: string): CostRecord[] {
    try {
      CostTracker.ensureCostsDirectory();
      const records: CostRecord[] = JSON.parse(fs.readFileSync(CostTracker.COSTS_FILE, 'utf-8'));
      return records.filter(record => record.testcaseId === testcaseId);
    } catch (error) {
      console.error('Error getting testcase costs:', error);
      return [];
    }
  }

  static getTotalCostForTestcase(testcaseId: string): number {
    const records = CostTracker.getTestcaseCosts(testcaseId);
    return Number(records.reduce((total, record) => total + record.cost, 0).toFixed(6));
  }

  static getAllTestcaseCosts(): Record<string, number> {
    try {
      CostTracker.ensureCostsDirectory();
      const records: CostRecord[] = JSON.parse(fs.readFileSync(CostTracker.COSTS_FILE, 'utf-8'));

      const costsByTestcase: Record<string, number> = {};
      records.forEach(record => {
        if (!costsByTestcase[record.testcaseId]) {
          costsByTestcase[record.testcaseId] = 0;
        }
        costsByTestcase[record.testcaseId] += record.cost;
      });

      // Round all costs to 6 decimal places
      Object.keys(costsByTestcase).forEach(testcaseId => {
        costsByTestcase[testcaseId] = Number(costsByTestcase[testcaseId].toFixed(6));
      });

      return costsByTestcase;
    } catch (error) {
      console.error('Error getting all testcase costs:', error);
      return {};
    }
  }
}
