import { useState, KeyboardEvent } from 'react';
import { Plus, X, Wrench } from 'lucide-react';
import { Button } from '../shared/Button';
import { EmptyState } from '../shared/EmptyState';
import { useAppStore } from '@/store/useAppStore';
import type { SkillTag } from '@/types/schema';

type Category = SkillTag['category'];
const CATEGORIES: Category[] = ['Technical', 'Tools', 'Soft', 'Languages'];

const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string }> = {
  Technical: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  Tools: {
    bg: 'bg-sky-50',
    text: 'text-sky-800',
    border: 'border-sky-200',
  },
  Soft: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  Languages: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
};

export function SkillTagEditor() {
  const skills = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.skills);
  const { addSkill, updateSkill, removeSkill } = useAppStore();

  const [activeTab, setActiveTab] = useState<'All' | Category>('All');
  const [newSkillText, setNewSkillText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('Technical');

  if (!skills) return null;

  const handleAdd = () => {
    const trimmed = newSkillText.trim();
    if (!trimmed) return;

    // Handle comma-separated bulk inputs: "React, TypeScript, Docker"
    const items = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    for (const item of items) {
      addSkill();
      const latestSkill = skills.data[skills.data.length - 1];
      if (latestSkill) {
        updateSkill(latestSkill.id, { name: item, category: selectedCategory });
      }
    }

    setNewSkillText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAdd();
    }
  };

  const filteredSkills = skills.data.filter(s => {
    if (activeTab === 'All') return true;
    return s.category === activeTab;
  });

  const getCount = (cat: 'All' | Category) => {
    if (cat === 'All') return skills.data.length;
    return skills.data.filter(s => s.category === cat).length;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Quick Add Bar */}
      {!skills.isLocked && (
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-gray-50 border border-gray-200">
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center justify-between">
            <span>Quick Add Skill</span>
            <span className="text-[11px] font-normal text-gray-500">Press Enter or comma to add</span>
          </label>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={newSkillText}
                onChange={(e) => setNewSkillText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. React, Next.js, Docker..."
                className="input text-sm py-2 px-3.5 bg-white border-gray-300 focus:border-primary-600 rounded-lg text-gray-900"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as Category)}
              className="input text-xs py-2 px-3 w-32 bg-white border-gray-300 rounded-lg shrink-0 cursor-pointer text-gray-800"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <Button
              variant="primary"
              size="sm"
              onClick={handleAdd}
              disabled={!newSkillText.trim()}
              className="shrink-0 px-3.5 py-2"
            >
              <Plus size={16} />
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      {skills.data.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {(['All', ...CATEGORIES] as const).map(cat => {
            const count = getCount(cat);
            const isActive = activeTab === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveTab(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isActive 
                    ? 'bg-primary-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-600 font-semibold'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Skills Chip Grid */}
      {skills.data.length === 0 && !skills.isLocked ? (
        <EmptyState
          icon={Wrench}
          title="No Skills Added Yet"
          description="Add technical proficiencies, tools, and soft skills to pass ATS keyword match criteria."
          buttonText="Add Your First Skill"
          onAdd={() => {
            addSkill();
            const latest = skills.data[skills.data.length - 1];
            if (latest) updateSkill(latest.id, { name: 'React', category: 'Technical' });
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2 pt-1 min-h-[60px]">
          {filteredSkills.map((skill) => {
            const colors = CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.Technical;
            return (
              <div
                key={skill.id}
                className={`group flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg border text-sm transition-all duration-150 ${colors.bg} ${colors.border} hover:shadow-xs`}
              >
                <span className={`font-medium ${colors.text}`}>{skill.name || 'Untitled Skill'}</span>
                
                {/* Category indicator pill */}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-gray-500 border border-gray-200 uppercase tracking-wider font-mono">
                  {skill.category}
                </span>

                {!skills.isLocked && (
                  <button
                    type="button"
                    onClick={() => removeSkill(skill.id)}
                    className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 transition-colors"
                    title={`Remove ${skill.name}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}

          {filteredSkills.length === 0 && skills.data.length > 0 && (
            <div className="w-full text-center py-6 text-xs text-gray-500">
              No skills in this category ({activeTab}).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
