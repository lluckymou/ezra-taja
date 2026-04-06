/* ================================================================
   LESSONS SYSTEM — Teacher NPC vocabulary & grammar progression
   
   Each lesson has:
   - id: string (unique key)
   - title: string (localizable)
   - emoji: string (lesson icon)
   - unlockedWords: string[] (Korean words learned)
   - unlockModifier: boolean (enables adjective modifier form ✨)
   - unlockVerbCounting: boolean (enables verb conjugation counting)
   - unlockBanmal: boolean (enables casual speech 🧢)
   - unlockHasipsioche: boolean (enables formal speech 👑)
   - relevance: number (1-6, weight for random selection)
   - type: 'fixed' | 'random' (fixed = always available, random = drawn per world)
   
   Content (markdown) is stored in lang/*.json files for i18n
================================================================ */

export const LESSONS_BASE = [
  // FIXED LESSONS (always available in order)
  {
    id: '1',
    title_key: 'lesson.hangulBasic.title',
    emoji: '📝',
    unlockedWords: ['쓰다', '한글'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 6,
    type: 'fixed',
    order: 0,
  },

  // RANDOM LESSONS (weighted by relevance, drawn per world)
  {
    id: '1.1',
    title_key: 'lesson.batchim.title',
    emoji: '🔤',
    unlockedWords: ['받다', '읽다', '닭', '꽃'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '2',
    title_key: 'lesson.colors.title',
    emoji: '🎨',
    unlockedWords: ['빨강', '주황', '노랑', '초록', '파랑', '보라', '검정', '하양', '회색'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '3',
    title_key: 'lesson.numbers.title',
    emoji: '🔢',
    unlockedWords: ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십', '백', '천', '만', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '4',
    title_key: 'lesson.ordinalNumbers.title',
    emoji: '📊',
    unlockedWords: ['첫', '둘째', '셋째', '넷째', '다섯째'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 2,
    type: 'random',
  },

  {
    id: '5',
    title_key: 'lesson.bodyParts.title',
    emoji: '👤',
    unlockedWords: ['머리', '얼굴', '눈', '코', '입', '귀', '이빨', '발', '손', '팔', '다리', '배', '가슴', '등', '목'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '6',
    title_key: 'lesson.animals.title',
    emoji: '🦁',
    unlockedWords: ['개', '고양이', '사자', '호랑이', '곰', '토끼', '여우', '늑대', '새', '물고기', '뱀', '거북이', '개미', '나비', '벌', '소'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '7',
    title_key: 'lesson.family.title',
    emoji: '👨‍👩‍👧‍👦',
    unlockedWords: ['아버지', '어머니', '형', '누나', '언니', '오빠', '동생', '할아버지', '할머니', '삼촌', '이모', '고모', '아버지의', '어머니의'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '8',
    title_key: 'lesson.foodDrinks.title',
    emoji: '🍽️',
    unlockedWords: ['밥', '국', '라면', '떡', '김밥', '피자', '치킨', '커피', '우유', '물', '주스', '차', '맥주', '포도주'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '9',
    title_key: 'lesson.clothing.title',
    emoji: '👕',
    unlockedWords: ['옷', '셔츠', '바지', '치마', '치마', '신발', '모자', '양말', '넥타이', '벨트', '가방', '지갑'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '10',
    title_key: 'lesson.householdItems.title',
    emoji: '🏠',
    unlockedWords: ['침대', '의자', '책상', '문', '창문', '책', '펜', '전등', '거울', '그림', '화분', '시계', '영화'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '11',
    title_key: 'lesson.schoolSupplies.title',
    emoji: '📚',
    unlockedWords: ['학교', '교실', '책', '공책', '펜', '연필', '지우개', '자', '책가방', '책상', '칠판', '선생님', '학생'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '12',
    title_key: 'lesson.emotions.title',
    emoji: '😊',
    unlockedWords: ['행복', '슬픔', '화남', '두려움', '놀람', '부끄러움', '사랑', '싫음', '피곤', '배고픔'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '13',
    title_key: 'lesson.weather.title',
    emoji: '🌤️',
    unlockedWords: ['날씨', '맑음', '흐림', '비', '눈', '바람', '구름', '해', '달', '별', '빛'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '14',
    title_key: 'lesson.daysOfWeek.title',
    emoji: '📅',
    unlockedWords: ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '15',
    title_key: 'lesson.months.title',
    emoji: '🗓️',
    unlockedWords: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '일월', '이월', '삼월'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '16',
    title_key: 'lesson.timeOfDay.title',
    emoji: '⏰',
    unlockedWords: ['아침', '낮', '저녁', '밤', '자정', '정오', '새벽', '황혼'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '17',
    title_key: 'lesson.seasons.title',
    emoji: '🍂',
    unlockedWords: ['봄', '여름', '가을', '겨울'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 2,
    type: 'random',
  },

  {
    id: '18',
    title_key: 'lesson.directions.title',
    emoji: '🧭',
    unlockedWords: ['북쪽', '남쪽', '동쪽', '서쪽', '위', '아래', '왼쪽', '오른쪽', '앞', '뒤', '안', '밖'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '19',
    title_key: 'lesson.basicVerbs.title',
    emoji: '✅',
    unlockedWords: ['하다', '가다', '오다', '있다', '없다', '먹다', '마시다', '자다', '일어나다', '앉다', '서다', '걷다', '뛰다'],
    unlockModifier: false,
    unlockVerbCounting: true, // First lesson unlocking verb conjugation counting
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '20',
    title_key: 'lesson.basicAdjectives.title',
    emoji: '📌',
    unlockedWords: ['크다', '작다', '크다', '길어', '짧다', '높다', '낮다', '밝다', '어둡다', '뜨겁다', '차갑다', '뜨겁다'],
    unlockModifier: true, // First lesson unlocking adjective modifier forms
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '21',
    title_key: 'lesson.banmal.title',
    emoji: '🧢',
    unlockedWords: ['너', '나', '우리', '그', '저', '이', '그것', '저것'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: true, // Banmal (casual speech) now available
    unlockHasipsioche: false,
    relevance: 2,
    type: 'random',
  },

  {
    id: '22',
    title_key: 'lesson.simpleParticles.title',
    emoji: '✨',
    unlockedWords: ['이', '가', '을', '를', '에', '에서', '로', '와', '도', '만', '뿐'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '23',
    title_key: 'lesson.opposites.title',
    emoji: '🔀',
    unlockedWords: ['크다', '작다', '길다', '짧다', '높다', '낮다', '많다', '적다', '좋다', '나쁘다', '뜨거운', '차가운'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '24',
    title_key: 'lesson.appearance.title',
    emoji: '🎨',
    unlockedWords: ['아름답다', '못생기다', '뚱뚱하다', '마른', '약하다', '강하다', '예쁘다', '잘생기다'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '25',
    title_key: 'lesson.dailyRoutine.title',
    emoji: '🔄',
    unlockedWords: ['깨어나다', '씻다', '옷을', '아침을', '학교에', '돌아오다', '숙제를', '저녁을', '텔레비전을', '자다'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '26',
    title_key: 'lesson.basicQuestions.title',
    emoji: '❓',
    unlockedWords: ['누구', '뭐', '어디', '언제', '왜', '어떠한', '어디서', '어디에'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '27',
    title_key: 'lesson.advancedParticles.title',
    emoji: '🔗',
    unlockedWords: ['으로부터', '까지', '처럼', '대로', '마다', '걸쳐', '대신', '대해', '관하여'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 2,
    type: 'random',
  },

  {
    id: '28',
    title_key: 'lesson.hasipsioche.title',
    emoji: '👑',
    unlockedWords: ['나라', '삼촌', '이모', '사람', '일', '학문'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: true, // Formal speech (-합니다 form) now available
    relevance: 2,
    type: 'random',
  },

  {
    id: '29',
    title_key: 'lesson.geography.title',
    emoji: '🌍',
    unlockedWords: ['호수', '산', '골짜기', '숲', '강', '바다', '해변', '섬', '까', '사막', '저지대', '고지대', '초원'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '30',
    title_key: 'lesson.professions.title',
    emoji: '💼',
    unlockedWords: ['의사', '선생님', '경찰관', '소방관', '간호사', '요리사', '농부', '어부', '운전사', '배우', '가수', '화가'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '31',
    title_key: 'lesson.toysGames.title',
    emoji: '🎮',
    unlockedWords: ['공', '인형', '장난감', '보드게임', '카드', '퍼즐', '연', '수레', '팽이'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '32',
    title_key: 'lesson.transport.title',
    emoji: '🚗',
    unlockedWords: ['자동차', '기차', '버스', '비행기', '배', '자전거', '오토바이', '트럭', '구급차'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '33',
    title_key: 'lesson.bodyHealth.title',
    emoji: '💪',
    unlockedWords: ['병', '약', '상처', '통증', '감기', '증상', '진단', '치료', '수술', '손실', '방지'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '34',
    title_key: 'lesson.koreanFood.title',
    emoji: '🍲',
    unlockedWords: ['김치', '비빔밥', '부께', '불고기', '떡볶이', '오뎅', '곱창', '순두부', '삼계탕', '된장'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '35',
    title_key: 'lesson.culturalHolidays.title',
    emoji: '🎆',
    unlockedWords: ['설날', '추석', '크리스마스', '새해', '생일', '축제', '불꽃', '답례'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },
];

// Get random lesson from highest-relevance available pool
export function getRandomLessonsForWorld(worldIdx, completedLessonIds = []) {
  const available = LESSONS_BASE.filter(
    l => l.type === 'random' && !completedLessonIds.includes(l.id)
  );
  if (available.length === 0) return null;
  const maxRelevance = Math.max(...available.map(l => l.relevance));
  const topPool = available.filter(l => l.relevance === maxRelevance);
  return topPool[Math.floor(Math.random() * topPool.length)];
}

// Get the next lesson the player should receive:
// - Fixed lessons first (ascending order field), skipping already-completed ones
// - Then highest-relevance random lessons
export function getNextLesson(completedLessonIds = []) {
  const fixedNext = LESSONS_BASE
    .filter(l => l.type === 'fixed' && !completedLessonIds.includes(l.id))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))[0];
  if (fixedNext) return fixedNext;
  return getRandomLessonsForWorld(0, completedLessonIds);
}
