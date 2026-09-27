import type { PublicCase } from '@/lib/types';
import { Icon } from './icons';

const FILTERS: [number, string][] = [[0, '전체 이야기'], [1, 'Lv.1 마음 알아보기'], [2, 'Lv.2 관계 이해하기'], [3, 'Lv.3 함께 바꾸기']];

export function Home({ catalog, filter, onFilter, onStart, onPreload }: {
  catalog: PublicCase[];
  filter: number;
  onFilter: (level: number) => void;
  onStart: (caseId: string) => void;
  onPreload: () => void;
}) {
  const cases = catalog.filter(c => !filter || c.level === filter);
  return (
    <main id="main">
      <section className="hero page-width" aria-labelledby="hero-title"><div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-line"></span>아이의 세계를 이해하는 대화 연습</p>
        <h1 id="hero-title">아이를 바꾸기 전에,<br /><em>이야기를 들어볼까요?</em></h1>
        <p className="hero-description">같은 행동에도 서로 다른 마음이 있어요.<br />여섯 아이의 이야기를 듣고, 작은 변화를 함께 연습해 보세요.</p>
        <a className="button primary" href="#stories">첫 번째 이야기 만나기 <Icon name="arrow" /></a>
        <p className="hero-footnote"><Icon name="shield" /> 가상의 아이와 연습하는 안전한 시작</p>
      </div><div className="hero-art" aria-hidden="true">
        <div className="art-ring"></div><span className="art-dot dot-one"></span><span className="art-dot dot-two"></span>
        <div className="floating-label top-label"><Icon name="chat" /> 어떤 순간이 어려웠어?</div>
        <div className="story-paper"><span className="paper-kicker">오늘의 마음 노트</span><div className="paper-lines"><span></span><span></span></div><div className="paper-sprout"><Icon name="leaf" /></div><p>듣고, 이해하고,<br /><strong>함께 자라기.</strong></p><span className="paper-number">01 — 06</span></div>
        <div className="floating-label bottom-label"><Icon name="spark" /> 작은 변화가 시작되는 곳</div>
      </div></section>
      <section className="journey page-width" aria-label="연습 과정"><div><span>01</span><div><strong>마음 알아보기</strong><p>아이의 말에서 마음 단서를 찾아요.</p></div></div><i></i><div><span>02</span><div><strong>방법 함께 정하기</strong><p>아이와 어른이 할 일을 함께 정해요.</p></div></div><i></i><div><span>03</span><div><strong>변화 확인</strong><p>같은 대화에서 한 번 시도해 봐요.</p></div></div></section>
      <section id="stories" className="stories page-width" aria-labelledby="stories-title">
        <div className="section-heading"><div><p className="eyebrow">SIX STORIES, SMALL STEPS</p><h2 id="stories-title">오늘은 누구의 이야기를 들어볼까요?</h2><p>단계가 올라갈수록 대화 거부와 감정 반응이 강한 상황을 연습해요.</p></div><span className="story-count">{cases.length}<small>개의 이야기</small></span></div>
        <div className="filter-row">
          <div className="filters" role="group" aria-label="난이도 선택">
            {FILTERS.map(([id, text]) => (
              <button key={id} className={`filter ${filter === id ? 'selected' : ''}`} aria-pressed={filter === id} onClick={() => onFilter(id)}>{text}</button>
            ))}
          </div>
          <span className="filter-note">각 단계 남아 1명 · 여아 1명</span>
        </div>
        <div className="card-grid">
          {cases.map(c => (
            <article key={c.id} className={`story-card ${c.color}`}>
              <div className="card-visual"><span className="level-badge">LEVEL {String(c.level).padStart(2, '0')}</span><span className="visual-orbit"></span><Icon name={c.motif} className="motif" /><span className="visual-dot"></span><span className="card-index">{String(catalog.indexOf(c) + 1).padStart(2, '0')}</span></div>
              <div className="card-body">
                <div className="persona-line"><span className="persona-dot"></span><strong>{c.name}</strong><span>만 {c.age}세 · {c.gender}</span></div>
                <h3>{c.title}</h3><p>{c.subtitle}</p>
                <span className="skill-tag"><Icon name="leaf" />{c.skill}</span>
                <button className="card-start" data-intent={`case:${c.id}`} aria-label={`${c.name}의 이야기 만나기`} onClick={() => onStart(c.id)} onPointerEnter={onPreload} onFocus={onPreload}>이야기 만나기 <Icon name="arrow" /></button>
              </div>
            </article>
          ))}
        </div>
        <div className="principle-note"><Icon name="note" /><p><strong>정답을 말하는 것보다, 함께 방법을 찾는 연습.</strong><br />진단명을 맞히거나 아이를 복종시키는 게임이 아니에요. 질문하고, 확인하고, 실행 가능한 도움을 만들어 보세요.</p></div>
      </section>
    </main>
  );
}
