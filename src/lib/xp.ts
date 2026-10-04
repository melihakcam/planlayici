// XP kuralları — sunucu (progress.ts) ve arayüz (anında "+XP" gösterimi) aynı formülü kullanır.

export const XP = {
  task: (duration: number, priority: number, wasTop: boolean) =>
    10 + Math.min(30, Math.round(duration / 3)) + (4 - priority) * 5 + (wasTop ? 15 : 0),
  focusMinute: 1,
  habit: 5,
  plan: 15,
  close: 15,
};

/** L. seviyeye ulaşmak için gereken toplam XP: 0, 100, 300, 600, 1000 … */
export const xpForLevel = (level: number) => 50 * level * (level - 1);

export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return { level, current: xp - xpForLevel(level), needed: xpForLevel(level + 1) - xpForLevel(level) };
}

const LEVEL_TITLES = ["Başlangıç", "Çırak", "Kararlı", "Odaklı", "Disiplinli", "Usta", "Uzman", "Efsane"];
export const levelTitle = (level: number) => LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 2))];
