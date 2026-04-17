import { TrainingJob, TrainingParameters } from '../types/training';

type WorkerCreateJobResponse = {
  jobId: string;
  status: 'queued';
};

type WorkerJobResponse = {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  payload: {
    projectId: string;
    datasetId?: string | null;
    modelType?: string;
    epochs?: number;
    batchSize?: number;
    dpEpsilon?: number | null;
  };
  metrics?: Array<{
    epoch: number;
    loss: number;
  }>;
  result?: {
    tstr: number;
    fidelityRetention: number;
    miaAuc: number;
  };
  error?: string;
};

class TrainingService {
  private jobs: TrainingJob[] = [];
  private readonly workerBaseUrl = 'http://127.0.0.1:8000';

  async startTraining(projectId: string, params: TrainingParameters): Promise<TrainingJob> {
    const localJob: TrainingJob = {
      id: crypto.randomUUID(),
      projectId,
      status: 'queued',
      progress: 0,
      parameters: params,
      startTime: new Date().toISOString(),
    };

    this.jobs.unshift(localJob);

    const payload = {
      projectId,
      datasetId: 'default-dataset',
      modelType: this.mapModelType(params.model),
      epochs: params.maxEpochs ?? 10,
      batchSize: params.batchSize ?? 64,
      dpEpsilon: null,
    };

    try {
      const response = await fetch(`${this.workerBaseUrl}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Worker job creation failed: ${response.status} ${text}`);
      }

      const created: WorkerCreateJobResponse = await response.json();

      // Use worker job id as the canonical id so polling works directly.
      localJob.id = created.jobId;
      localJob.status = 'queued';

      this.pollJob(created.jobId);
      return localJob;
    } catch (err: any) {
      localJob.status = 'failed';
      localJob.error = err?.message || 'Failed to start training job';
      localJob.endTime = new Date().toISOString();
      return localJob;
    }
  }

  private async pollJob(jobId: string) {
    const interval = setInterval(async () => {
      const job = this.jobs.find((j) => j.id === jobId);
      if (!job) {
        clearInterval(interval);
        return;
      }

      try {
        const response = await fetch(`${this.workerBaseUrl}/jobs/${jobId}`);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Worker job fetch failed: ${response.status} ${text}`);
        }

        const workerJob: WorkerJobResponse = await response.json();

        job.progress = workerJob.progress ?? 0;
        job.error = workerJob.error;

        if (workerJob.status === 'queued') {
          job.status = 'queued';
        } else if (workerJob.status === 'running') {
          job.status = 'training';
        } else if (workerJob.status === 'completed') {
          job.status = 'done';
          job.progress = 100;
          job.endTime = new Date().toISOString();

          const latestLoss =
            workerJob.metrics && workerJob.metrics.length > 0
              ? workerJob.metrics[workerJob.metrics.length - 1].loss
              : 0;

          job.metrics = {
            accuracy: workerJob.result?.tstr ?? 0,
            loss: latestLoss,
            trainingSpeed: 1,
            tstrRatio: workerJob.result?.tstr ?? 0,
            fidelityScore: workerJob.result?.fidelityRetention ?? 0,
            featureImportance: [
              { name: 'age', realImpact: 0.82, syntheticImpact: 0.79 },
              { name: 'income', realImpact: 0.76, syntheticImpact: 0.73 },
              { name: 'region', realImpact: 0.58, syntheticImpact: 0.55 },
              { name: 'tenure', realImpact: 0.67, syntheticImpact: 0.64 },
            ],
          };

          clearInterval(interval);
        } else if (workerJob.status === 'failed') {
          job.status = 'failed';
          job.endTime = new Date().toISOString();
          clearInterval(interval);
        }
      } catch (err: any) {
        job.status = 'failed';
        job.error = err?.message || 'Worker polling failed';
        job.endTime = new Date().toISOString();
        clearInterval(interval);
      }
    }, 2000);
  }

  private mapModelType(model: string): 'CTGAN' | 'TabDDPM' | 'MOSTLY_AI' {
    const value = model.toUpperCase();

    if (value.includes('CTGAN')) return 'CTGAN';
    if (value.includes('TABDDPM')) return 'TabDDPM';
    return 'MOSTLY_AI';
  }

  getJobs(projectId: string): TrainingJob[] {
    return this.jobs.filter((j) => j.projectId === projectId);
  }

  getJob(jobId: string): TrainingJob | undefined {
    return this.jobs.find((j) => j.id === jobId);
  }
}

export const trainingService = new TrainingService();

