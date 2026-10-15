import { useAppStore } from '@/store/useAppStore';
import { Card } from '../shared/Card';
import { Plus, Trash2, Award } from 'lucide-react';
import { Button } from '../shared/Button';
import { EmptyState } from '../shared/EmptyState';

export function CertificationCardEditor() {
  const certifications = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.certifications);
  const { addCertification, updateCertification, removeCertification } = useAppStore();

  if (!certifications) return null;

  return (
    <div className={`w-full flex flex-col gap-4 relative ${certifications.isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
      {certifications.isLocked && (
        <div className="flex justify-end mb-1">
          <span className="text-xs font-semibold tracking-wide px-3 py-1 rounded-full border border-accent-400/30 bg-accent-400/10 text-accent-400">
            ✓ Verified
          </span>
        </div>
      )}

      {certifications.data.length === 0 && !certifications.isLocked ? (
        <EmptyState
          icon={Award}
          title="No Certifications Added"
          description="Include verified credentials, professional licenses, and cloud certifications to boost your ATS match."
          buttonText="Add Certification"
          onAdd={addCertification}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {certifications.data.map((cert) => (
            <Card key={cert.id} className="p-4 border-gray-200 bg-white shadow-xs relative group">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary-700 font-semibold text-xs uppercase tracking-wider">
                    <Award size={15} />
                    <span>Credential</span>
                  </div>
                  {!certifications.isLocked && (
                    <button
                      type="button"
                      onClick={() => removeCertification(cert.id)}
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                      title="Remove Certification"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Certification Name
                  </label>
                  <input
                    type="text"
                    value={cert.name}
                    onChange={(e) => updateCertification(cert.id, { name: e.target.value })}
                    disabled={certifications.isLocked}
                    placeholder="e.g. AWS Certified Solutions Architect – Associate"
                    className="input text-sm font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Issuing Organization
                    </label>
                    <input
                      type="text"
                      value={cert.issuer}
                      onChange={(e) => updateCertification(cert.id, { issuer: e.target.value })}
                      disabled={certifications.isLocked}
                      placeholder="e.g. Amazon Web Services"
                      className="input text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Issue / Expiry Date
                    </label>
                    <input
                      type="text"
                      value={cert.date}
                      onChange={(e) => updateCertification(cert.id, { date: e.target.value })}
                      disabled={certifications.isLocked}
                      placeholder="e.g. 2023 – 2026"
                      className="input text-sm"
                    />
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {!certifications.isLocked && (
            <Button
              onClick={addCertification}
              variant="secondary"
              className="w-full mt-1 border-dashed border-gray-300 py-2.5 text-sm flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Add Another Certification
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
