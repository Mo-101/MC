export type MostlyModel = 'MOSTLY_AI/Small' | 'MOSTLY_AI/Medium' | 'MOSTLY_AI/Large' | 'MOSTLY_AI/LSTMFromScratch-3m' | 'microsoft/phi-1_5';

export interface TrainingParameters {
  model: MostlyModel;
  maxSampleSize?: number;
  batchSize?: number;
  gradientAccumulationSteps?: number;
  maxTrainingTime: number; // in minutes
  maxEpochs: number;
}

export interface TrainingJob {
  id: string;
  projectId: string;
  status: 'new' | 'queued' | 'training' | 'done' | 'failed';
  progress: number;
  parameters: TrainingParameters;
  startTime: string;
  endTime?: string;
  metrics?: {
    accuracy?: number;
    loss?: number;
    trainingSpeed?: number; // samples/sec
    tstrRatio?: number; // Train on Synthetic, Test on Real
    fidelityScore?: number;
    featureImportance?: {
      name: string;
      realImpact: number;
      syntheticImpact: number;
    }[];
  };
  error?: string;
}
