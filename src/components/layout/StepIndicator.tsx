import { Check } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { AppStep } from '@/types/schema';

interface StepConfig {
  key: AppStep;
  label: string;
  number: number;
}

const STEPS: StepConfig[] = [
  { key: 'edit', label: 'Build Profile', number: 1 },
  { key: 'confirm', label: 'Confirm & Lock', number: 2 },
  { key: 'tailor', label: 'AI Tailor', number: 3 },
  { key: 'review', label: 'Review & Compare', number: 4 },
  { key: 'export', label: 'Export PDF', number: 5 },
];

const STEP_ORDER: AppStep[] = ['edit', 'confirm', 'tailor', 'review', 'export'];

function getStepStatus(stepKey: AppStep, currentStep: AppStep): 'active' | 'completed' | 'pending' {
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const stepIdx = STEP_ORDER.indexOf(stepKey);

  if (stepIdx === currentIdx) return 'active';
  if (stepIdx < currentIdx) return 'completed';
  return 'pending';
}

export function StepIndicator() {
  const currentStep = useAppStore((s) => s.currentStep);

  return (
    <nav className="w-full" aria-label="Progress steps">
      <div className="flex items-center justify-center gap-0 max-w-2xl mx-auto">
        {STEPS.map((step, index) => {
          const status = getStepStatus(step.key, currentStep);

          return (
            <div key={step.key} className="flex items-center" style={{ flex: index < STEPS.length - 1 ? 1 : 'none' }}>
              {/* Step dot */}
              <div className="flex flex-col items-center gap-1.5">
                <div className={`step-dot step-dot--${status}`}>
                  {status === 'completed' ? (
                    <Check size={16} strokeWidth={3} />
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className="text-xs font-medium whitespace-nowrap"
                  style={{
                    color: status === 'active'
                      ? 'var(--color-primary-400)'
                      : status === 'completed'
                        ? 'var(--color-success)'
                        : 'var(--color-surface-200)',
                    opacity: status === 'pending' ? 0.5 : 1,
                  }}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={`step-connector step-connector--${status === 'completed' ? 'completed' : status === 'active' ? 'active' : 'pending'}`}
                  style={{ margin: '0 0.5rem', marginBottom: '1.5rem' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
