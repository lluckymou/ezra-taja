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
    unlockedWords: ['아파트', '마트', '카페', '회사', '가게', '나라', '보따리', '피자', '커피', '우유', '케이크', '사과', '바나나', '포도', '토마토', '과자', '차', '치즈'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 6,
    type: 'fixed',
    order: 0,
  },

  {
    id: '2',
    title_key: 'lesson.batchim.title',
    emoji: '🔤',
    unlockedWords: ['집', '학교', '병원', '서울', '한국', '공원', '도서관', '시장', '영화관', '놀이터', '동물원', '은행', '호텔', '공항', '역', '학원', '식당', '상점', '쇼핑', '할인', '판매', '상인', '방', '종교', '선물', '보물', '보석', '황금', '상품', '상금', '아이템', '선택', '마법', '주문', '강화', '능력', '보상', '수정', '밥', '국', '라면', '김밥', '치킨', '빵', '딸기', '수박', '오렌지', '당근', '감자', '삼겹살', '비빔밥', '불고기', '떡볶이', '초콜릿', '물', '쌀', '계란'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 6,
    type: 'fixed',
    order: 1,
  },

  // RANDOM LESSONS (weighted by relevance, drawn per world)
  {
    id: '3',
    title_key: 'lesson.hanja.title',
    emoji: '🈶️',
    unlockedWords: ['인', '북', '남', '군', '수', '모', '학', '중', '외', '교', '금', '동', '한', '서', '실', '국', '청', '생', '민', '선', '여', '부', '제', '촌', '토', '장', '대', '월'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '4',
    title_key: 'lesson.colors.title',
    emoji: '🎨',
    unlockedWords: ['빨간색', '파란색', '노란색', '초록색', '하얀색', '검은색', '보라색', '주황색', '분홍색', '회색', '금색', '은색', '빨강', '파랑', '노랑', '초록', '검정', '하양', '주황', '분홍', '보라', '갈색'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '5',
    title_key: 'lesson.numbers.title',
    emoji: '🔢',
    unlockedWords: ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '6',
    title_key: 'lesson.sinoNumbers.title',
    emoji: '💵',
    unlockedWords: ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십', '백', '천', '만', '억', '영', '공'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '7',
    title_key: 'lesson.bodyParts.title',
    emoji: '👤',
    unlockedWords: ['눈:👁️', '코', '귀', '입', '손', '발', '머리', '머리카락', '뇌', '심장', '배:🫃', '다리:🦵', '피', '뼈', '근육', '피부', '눈썹', '이', '혀', '턱', '목', '어깨', '팔', '등', '몸', '손가락', '무릎', '발가락', '아프다', '건강하다', '병:🤒', '약', '주사', '청진기'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '8',
    title_key: 'lesson.animals.title',
    emoji: '🦁',
    unlockedWords: ['개', '강아지', '고양이', '토끼', '곰', '호랑이', '사자', '코끼리', '기린', '원숭이', '펭귄', '독수리', '악어', '하마', '소', '말:🐴', '닭', '새', '벌:🐝', '파리', '사슴', '다람쥐', '해파리', '물고기', '거미', '모기', '부엉이', '앵무새', '두루미', '소라', '게', '새우', '오징어', '연어', '뱀', '개구리', '나비', '거북이', '상어', '문어', '고래', '돼지', '양', '여우', '늑대', '고슴도치', '판다'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '9',
    title_key: 'lesson.family.title',
    emoji: '👨‍👩‍👧‍👦',
    unlockedWords: ['엄마', '아빠', '할머니', '할아버지', '남동생', '여동생', '남편', '아내', '오빠', '누나', '형', '언니', '삼촌', '이모', '가족', '남자', '여자', '아이', '소년', '소녀', '노인'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '10',
    title_key: 'lesson.foodDrinks.title',
    emoji: '🍽️',
    unlockedWords: ['밥', '국', '라면', '김밥', '피자', '치킨', '커피', '우유', '빵', '케이크', '사과', '배:🍐', '딸기', '바나나', '수박', '포도', '오렌지', '레몬', '망고', '키위', '복숭아', '당근', '감자', '고구마', '버섯', '오이', '토마토', '마늘', '양파', '삼겹살', '찌개', '비빔밥', '불고기', '떡볶이', '냉면', '삼계탕', '과자', '초콜릿', '물', '차', '꿀', '콩', '쌀', '소금', '설탕', '계란', '치즈', '버터', '된장', '간장', '고추', '참외', '자두', '파인애플', '코코넛', '아보카도', '브로콜리', '옥수수', '호박', '두부', '순두부', '만두', '잡채', '김', '참치', '새우', '조개', '밤', '과일', '야채', '고기', '생선', '주스'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '11',
    title_key: 'lesson.clothing.title',
    emoji: '👕',
    unlockedWords: ['옷', '바지', '셔츠', '치마', '양말', '장갑', '코트', '지갑', '모자', '신발', '안경', '우산', '드레스'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '12',
    title_key: 'lesson.householdItems.title',
    emoji: '🏠',
    unlockedWords: ['책', '시계', '전화기', '컴퓨터', '의자', '침대', '가방', '열쇠', '문', '창문', '거울', '상자', '병:🍾', '거실', '부엌', '화장실', '욕조', '변기', '칫솔'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '13',
    title_key: 'lesson.schoolSupplies.title',
    emoji: '📚',
    unlockedWords: ['연필', '가위', '자', '공책', '지우개', '숙제', '시험', '문제', '질문', '대답', '수업', '선생님'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '14',
    title_key: 'lesson.emotions.title',
    emoji: '😊',
    unlockedWords: ['마음', '행복', '슬픔', '화', '두려움', '사랑', '기쁨', '웃음', '걱정', '희망', '용기', '자신감', '외로움', '부끄러움', '실망', '놀람', '지루함', '기쁘다', '좋아하다', '졸리다'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '15',
    title_key: 'lesson.weather.title',
    emoji: '🌤️',
    unlockedWords: ['눈:❄️', '바람', '구름', '번개', '태풍', '무지개', '비', '날씨', '폭풍', '안개', '천둥', '홍수', '가뭄', '지진', '화산', '봄', '여름', '가을', '겨울', '아침', '저녁', '밤', '낮', '주말', '시간', '분', '시', '년', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일', '일월', '이월', '삼월', '사월', '오월', '유월', '칠월', '팔월', '구월', '시월', '십일월', '십이월'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '16',
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
    id: '17',
    title_key: 'lesson.months.title',
    emoji: '🗓️',
    unlockedWords: ['일월', '이월', '삼월', '사월', '오월', '유월', '칠월', '팔월', '구월', '시월', '십일월', '십이월'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '18',
    title_key: 'lesson.timeOfDay.title',
    emoji: '⏰',
    unlockedWords: ['아침', '저녁', '밤', '낮', '주말'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '19',
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
    id: '20',
    title_key: 'lesson.directions.title',
    emoji: '🧭',
    unlockedWords: ['위', '아래', '밖', '왼쪽', '오른쪽', '앞', '뒤', '북', '남', '동', '서'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '21',
    title_key: 'lesson.verbConjulgationAndUnderstandingSOV.title',
    emoji: '✅',
    unlockedWords: ['먹다', '마시다', '자다', '가다', '오다', '보다', '듣다', '말하다', '쓰다', '읽다', '알다', '사다', '하다', '있다', '없다'],
    unlockModifier: false,
    unlockVerbCounting: true, // First lesson unlocking verb conjugation counting
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '22',
    title_key: 'lesson.adjectives.title',
    emoji: '📌',
    unlockedWords: ['크다', '작다', '빠르다', '느리다', '예쁘다', '좋다', '나쁘다', '많다', '적다', '높다', '낮다', '길다', '짧다', '무겁다', '가볍다', '뜨겁다', '차갑다', '밝다', '어둡다', '맛있다', '어렵다', '쉽다', '따뜻하다', '시원하다', '덥다', '춥다', '맑다', '약하다'],
    unlockModifier: true, // First lesson unlocking adjective modifier forms
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 5,
    type: 'random',
  },

  {
    id: '23',
    title_key: 'lesson.banmal.title',
    emoji: '🧢',
    unlockedWords: ['사랑하다', '달리다', '뛰다', '날다', '싸우다', '이기다', '지다', '열다', '닫다', '던지다', '잡다', '찾다', '숨다', '죽다', '살다', '웃다', '울다', '노래하다', '춤추다', '걷다', '앉다', '서다', '만들다', '배우다', '가르치다', '도와주다', '생각하다', '느끼다', '기억하다', '잊다', '만나다', '떠나다', '시작하다', '끝나다', '선택하다', '변하다', '사용하다', '올리다', '내리다', '넣다', '꺼내다', '모으다', '나누다', '입다', '벗다', '씻다', '청소하다', '공부하다', '운전하다', '전화하다', '자르다', '일어나다', '그리다', '뛰놀다'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: true, // Banmal (casual speech) now available
    unlockHasipsioche: false,
    relevance: 2,
    type: 'random',
  },

  {
    id: '24',
    title_key: 'lesson.particles.title',
    emoji: '✨',
    unlockedWords: [],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '25',
    title_key: 'lesson.hobbies.title',
    emoji: '🔀',
    unlockedWords: [],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 4,
    type: 'random',
  },

  {
    id: '26',
    title_key: 'lesson.appearance.title',
    emoji: '🎨',
    unlockedWords: ['예쁘다', '아름답다', '귀엽다', '크다', '작다', '길다', '짧다', '밝다', '어둡다'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '27',
    title_key: 'lesson.dailyRoutine.title',
    emoji: '🔄',
    unlockedWords: ['일어나다', '씻다', '먹다', '마시다', '공부하다', '자다', '걷다', '달리다', '앉다', '서다', '입다', '벗다', '청소하다', '운전하다', '전화하다'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '28',
    title_key: 'lesson.basicQuestions.title',
    emoji: '❓',
    unlockedWords: ['질문', '대답'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 3,
    type: 'random',
  },

  {
    id: '29',
    title_key: 'lesson.connectors.title',
    emoji: '🔗',
    unlockedWords: [/* unlock de conectores */],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 2,
    type: 'random',
  },

  {
    id: '30',
    title_key: 'lesson.hasipsioche.title',
    emoji: '👑',
    unlockedWords: ['먹다', '마시다', '자다', '가다', '오다', '보다', '듣다', '말하다', '쓰다', '읽다', '알다', '사다', '하다', '있다', '없다', '사랑하다', '달리다', '뛰다', '날다', '싸우다', '이기다', '지다', '열다', '닫다', '던지다', '잡다', '찾다', '숨다', '죽다', '살다', '웃다', '울다', '노래하다', '춤추다', '걷다', '앉다', '서다', '만들다', '배우다', '가르치다', '도와주다', '생각하다', '느끼다', '기억하다', '잊다', '만나다', '떠나다', '시작하다', '끝나다', '선택하다', '변하다', '사용하다', '올리다', '내리다', '넣다', '꺼내다', '모으다', '나누다', '입다', '벗다', '씻다', '청소하다', '공부하다', '운전하다', '전화하다', '자르다', '일어나다', '그리다', '뛰놀다'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: true, // Formal speech (-합니다 form) now available
    relevance: 2,
    type: 'random',
  },

  {
    id: '31',
    title_key: 'lesson.geography.title',
    emoji: '🌍',
    unlockedWords: ['산', '강', '바다', '섬', '땅', '길', '나라', '세계', '북', '남', '동', '서', '위', '아래', '앞', '뒤'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '32',
    title_key: 'lesson.professions.title',
    emoji: '💼',
    unlockedWords: ['학생', '선생', '의사', '경찰', '요리사', '왕', '마법사', '군인', '농부', '가수', '운동선수', '강사님', '교수님', '스승님'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '33',
    title_key: 'lesson.toysGames.title',
    emoji: '🎮',
    unlockedWords: ['게임', '주사위'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '34',
    title_key: 'lesson.transport.title',
    emoji: '🚗',
    unlockedWords: ['차:🚗', '자전거', '지하철', '비행기', '배:🚢', '버스', '택시', '기차', '오토바이', '로켓'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '35',
    title_key: 'lesson.placesAndBuildings.title',
    emoji: '🏙️',
    unlockedWords: [],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '36',
    title_key: 'lesson.koreanFood.title',
    emoji: '🍲',
    unlockedWords: ['김치', '소주', '막걸리', '명절', '추석', '설날', '태극기', '무궁화', '온돌', '비빔밥', '불고기', '떡볶이', '냉면', '삼계탕', '김', '된장', '간장', '고추', '두부', '만두', '잡채', '삼겹살', '찌개'],
    unlockModifier: false,
    unlockVerbCounting: false,
    unlockBanmal: false,
    unlockHasipsioche: false,
    relevance: 1,
    type: 'random',
  },

  {
    id: '37',
    title_key: 'lesson.culturalHolidays.title',
    emoji: '🎆',
    unlockedWords: ['명절', '추석', '설날'],
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
