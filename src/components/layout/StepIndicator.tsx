import { Check } from 'lucide-react';

/**
 * StepIndicator — visual-only progress dots.
 * The app no longer uses a step-based flow; this component is kept
 * for potential future use but doesn't read from the store.
 * Pass `currentStep` explicitly when rendering.
 */

type AppStep = 'edit' | 'confirm' | 'tailor' | 'review' | 'export';

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

interface Props {
  currentStep?: AppStep;
}

export function StepIndicator({ currentStep = 'edit' }: Props) {
  return (
    <nav className="w-full" aria-label="Progress steps">
      <div className="flex items-center justify-center gap-0 max-w-2xl mx-auto">
        {STEPS.map((step, index) => {
          const status = getStepStatus(step.key, currentStep);

          return (
            <div key={step.key} className="flex items-center" style={{ flex: index < STEPS.length - 1 ? 1 : 'none' }}>
              {/* Step dot */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    status === 'active'
                      ? 'bg-gradient-to-br from-[#22d3ee] to-[#a855f7] text-white shadow-[0_0_16px_rgba(34,211,238,0.4)]'
                      : status === 'completed'
                        ? 'bg-[rgba(34,211,238,0.15)] text-[#8aebff] border border-[rgba(34,211,238,0.3)]'
                        : 'bg-[rgba(255,255,255,0.05)] text-on-surface-variant border border-white/10'
                  }`}
                >
                  {status === 'completed' ? (
                    <Check size={16} strokeWidth={3} />
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    status === 'active'
                      ? 'text-primary-400'
                      : status === 'completed'
                        ? 'text-primary-500'
                        : 'text-on-surface-variant opacity-50'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 mx-2 mb-6 transition-all duration-300 ${
                    status === 'completed'
                      ? 'bg-gradient-to-r from-[#22d3ee] to-[#a855f7]'
                      : 'bg-white/10'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
