import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Linkedin, Github, Globe, Link as LinkIcon, Mail, Phone, MapPin, AlertCircle, Camera, X } from 'lucide-react';

export function ResumeHeaderEditor() {
  const header = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.resumeHeader);
  const updateHeader = useAppStore((s) => s.updateResumeHeader);
  const [showPhotoUpload, setShowPhotoUpload] = useState(Boolean(header?.data.photoUrl));

  if (!header) return null;

  const handleNameChange = (first?: string, last?: string) => {
    const newFirst = first !== undefined ? first : (header.data.firstName ?? (header.data.name?.split(' ')[0] || ''));
    const newLast = last !== undefined ? last : (header.data.lastName ?? (header.data.name?.split(' ').slice(1).join(' ') || ''));
    const fullName = `${newFirst} ${newLast}`.trim();
    updateHeader({
      firstName: newFirst,
      lastName: newLast,
      name: fullName,
    });
  };

  return (
    <div className={`w-full relative flex flex-col gap-4 pt-1 ${header.isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
      {header.isLocked && (
        <div className="flex justify-end mb-1">
          <span className="text-xs font-semibold tracking-wide px-2.5 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">
            ✓ Verified
          </span>
        </div>
      )}

      {/* Name and Title Section */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              First / Given Name
            </label>
            <input
              type="text"
              value={header.data.firstName ?? (header.data.name?.split(' ')[0] || '')}
              onChange={(e) => handleNameChange(e.target.value, undefined)}
              placeholder="e.g. ibrahim"
              disabled={header.isLocked}
              className="input text-sm font-medium"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Last / Family Name
            </label>
            <input
              type="text"
              value={header.data.lastName ?? (header.data.name?.split(' ').slice(1).join(' ') || '')}
              onChange={(e) => handleNameChange(undefined, e.target.value)}
              placeholder="e.g. alsharjabi"
              disabled={header.isLocked}
              className="input text-sm font-medium"
            />
          </div>
        </div>

        {/* Desired Job Title / Headline */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Desired Job Title / Headline
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={header.data.useAsHeadline || false}
                onChange={(e) => updateHeader({ useAsHeadline: e.target.checked })}
                disabled={header.isLocked}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
              />
              Show subtitle
            </label>
          </div>
          <input
            type="text"
            value={header.data.desiredJobPosition || ''}
            onChange={(e) => updateHeader({ desiredJobPosition: e.target.value })}
            placeholder="e.g. Full Stack Developer"
            disabled={header.isLocked}
            className="input text-sm"
          />
        </div>
      </div>

      {/* Contact Details */}
      <div className="pt-3 border-t border-gray-100 flex flex-col gap-3">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Contact Details
        </span>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <Mail size={13} className="text-gray-400" /> Email Address
            </label>
            <input
              type="email"
              value={header.data.email || ''}
              onChange={(e) => updateHeader({ email: e.target.value })}
              placeholder="ibrahimalsharjabi69@gmail.com"
              disabled={header.isLocked}
              className="input text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <Phone size={13} className="text-gray-400" /> Phone Number
            </label>
            <input
              type="tel"
              value={header.data.phone || ''}
              onChange={(e) => updateHeader({ phone: e.target.value })}
              placeholder="+1 (555) 234-5678"
              disabled={header.isLocked}
              className="input text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
            <MapPin size={13} className="text-gray-400" /> Location (City, Country)
          </label>
          <input
            type="text"
            value={header.data.location || ''}
            onChange={(e) => updateHeader({ location: e.target.value })}
            placeholder="e.g. New York, USA"
            disabled={header.isLocked}
            className="input text-sm"
          />
        </div>
      </div>

      {/* Online Profiles & Links */}
      <div className="pt-3 border-t border-gray-100 flex flex-col gap-3">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Links & Online Profiles
        </span>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <Linkedin size={13} className="text-gray-400" /> LinkedIn
            </label>
            <input
              type="text"
              value={header.data.linkedin || ''}
              onChange={(e) => updateHeader({ linkedin: e.target.value })}
              placeholder="linkedin.com/in/username"
              disabled={header.isLocked}
              className="input text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <Github size={13} className="text-gray-400" /> GitHub
            </label>
            <input
              type="text"
              value={header.data.github || ''}
              onChange={(e) => updateHeader({ github: e.target.value })}
              placeholder="github.com/username"
              disabled={header.isLocked}
              className="input text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <Globe size={13} className="text-gray-400" /> Portfolio / Website
            </label>
            <input
              type="text"
              value={header.data.portfolio || ''}
              onChange={(e) => updateHeader({ portfolio: e.target.value })}
              placeholder="mywebsite.com"
              disabled={header.isLocked}
              className="input text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <LinkIcon size={13} className="text-gray-400" /> Other URL
            </label>
            <input
              type="text"
              value={header.data.otherUrl || ''}
              onChange={(e) => updateHeader({ otherUrl: e.target.value })}
              placeholder="https://..."
              disabled={header.isLocked}
              className="input text-sm"
            />
          </div>
        </div>
      </div>

      {/* Optional Photo Toggle */}
      <div className="pt-2">
        {!showPhotoUpload ? (
          <button
            type="button"
            onClick={() => setShowPhotoUpload(true)}
            className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1.5 transition-colors font-medium"
          >
            <Camera size={14} />
            <span>Add profile photo (Optional)</span>
          </button>
        ) : (
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Camera size={14} className="text-purple-600" /> Photo URL
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowPhotoUpload(false);
                  updateHeader({ photoUrl: '' });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>
            <input
              type="url"
              value={header.data.photoUrl || ''}
              onChange={(e) => updateHeader({ photoUrl: e.target.value })}
              placeholder="https://example.com/photo.jpg"
              className="input text-sm"
            />
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              <AlertCircle size={12} className="shrink-0 text-amber-500" />
              Note: US/UK ATS parsers favor clean text-only resumes without photos.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
