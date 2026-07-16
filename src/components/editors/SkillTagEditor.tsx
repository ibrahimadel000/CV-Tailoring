import { useState, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { Card } from '../shared/Card';
import { useAppStore } from '@/store/useAppStore';
import type { SkillTag } from '@/types/schema';

type Category = SkillTag['category'];
const CATEGORIES: Category[] = ['Technical', 'Soft', 'Tools', 'Languages'];

export function SkillTagEditor() {
  const skills = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.skills);
  const { addSkill, removeSkill } = useAppStore();
  const [inputValue, setInputValue] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('Technical');

  if (!skills) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addSkill(inputValue.trim(), selectedCategory);
      setInputValue('');
    }
  };

  const getCategoryClass = (category: Category) => {
    switch (category) {
      case 'Technical': return 'chip--technical';
      case 'Soft': return 'chip--soft';
      case 'Tools': return 'chip--tools';
      case 'Languages': return 'chip--languages';
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{skills.title}</h3>
      </div>

      <Card locked={skills.isLocked}>
        {!skills.isLocked && (
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as Category)}
              className="input md:w-48 appearance-none bg-[var(--color-surface-900)] border-[oklch(1_0_0/0.08)] text-[var(--color-surface-100)]"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Type a ${selectedCategory.toLowerCase()} skill and press Enter`}
                className="input w-full pr-12"
              />
              <button
                onClick={() => {
                  if (inputValue.trim()) {
                    addSkill(inputValue.trim(), selectedCategory);
                    setInputValue('');
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-primary-400)] hover:text-[var(--color-primary-300)] p-1"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {CATEGORIES.map(category => {
            const categorySkills = skills.data.filter(s => s.category === category);
            if (categorySkills.length === 0) return null;

            return (
              <div key={category}>
                <h4 className="text-sm font-medium text-[var(--color-surface-200)] mb-3">{category}</h4>
                <div className="flex flex-wrap gap-2">
                  {categorySkills.map(skill => (
                    <div key={skill.id} className={`chip ${getCategoryClass(skill.category)} group`}>
                      {skill.name}
                      {!skills.isLocked && (
                        <button
                          onClick={() => removeSkill(skill.id)}
                          className="ml-1 opacity-60 hover:opacity-100 transition-opacity focus-ring rounded-full"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
