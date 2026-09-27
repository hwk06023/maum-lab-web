import type { PublicCase } from '@/lib/types';
import { displayText } from '@/lib/display-text';
import { Icon } from './icons';

const FILTERS: [number, string][] = [[0, '전체'], [1, 'Lv.1 쉬움'], [2, 'Lv.2 보통'], [3, 'Lv.3 어려움']];

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
        <p className="eyebrow"><span className="eyebrow-line"></span>마음을 이해하는 대화 연습</p>
        <h1 id="hero-title">대화로 여는<br /><em>작은 변화.</em></h1>
        <div className="hero-summary"><p className="hero-description">아이의 마음을 듣고,<br />함께 다음 행동을 찾아요.</p><p className="hero-footnote"><Icon name="shield" /> 성인을 위한 가상 상담</p></div>
        <a className="button primary" href="#stories">연습 시작하기 <Icon name="arrow" /></a>
      </div><div className="hero-art" aria-hidden="true">
        <div className="art-ring"></div>
        <div className="floating-label top-label"><Icon name="chat" /> 어떤 순간이 어려웠어?</div>
        <div className="story-paper"><span className="paper-kicker">오늘의 마음 노트</span><div className="paper-lines"><span></span><span></span></div><div className="paper-sprout"><Icon name="leaf" /></div><p>듣고, 이해하고,<br /><strong>함께 자라기.</strong></p><span className="paper-number">01 — 06</span></div>
        <div className="floating-label bottom-label"><Icon name="spark" /> 조금씩, 함께</div>
      </div></section>
      <section className="journey page-width" aria-label="연습 과정">{['마음 듣기', '공감하기', '행동 제안', '변화 확인'].map((step, i) => <div key={step}><span>{String(i + 1).padStart(2, '0')}</span><strong>{step}</strong></div>)}</section>
      <section id="stories" className="stories page-width" aria-labelledby="stories-title">
        <div className="section-heading"><div><p className="eyebrow">오늘의 연습</p><h2 id="stories-title">누구와 이야기할까요?</h2></div><p className="story-count">{cases.length}개의 이야기</p></div>
        <div className="filter-row">
          <div className="filters" role="group" aria-label="난이도 선택">
            {FILTERS.map(([id, text]) => (
              <button key={id} className={`filter ${filter === id ? 'selected' : ''}`} aria-pressed={filter === id} onClick={() => onFilter(id)}>{text}</button>
            ))}
          </div>
          <span className="filter-note">레벨이 높을수록 깊은 이해가 필요해요.</span>
        </div>
        <div className="card-grid">
          {cases.map(c => (
            <article key={c.id} className={`story-card ${c.color}`}>
              <div className="card-visual"><span className="level-badge">LEVEL {String(c.level).padStart(2, '0')}</span><span className="visual-orbit"></span><Icon name={c.motif} className="motif" /><span className="card-index">{String(catalog.indexOf(c) + 1).padStart(2, '0')}</span></div>
              <div className="card-body">
                <div className="persona-line"><strong>{c.name}</strong><span>만 {c.age}세 / {c.gender}</span></div>
                <h3>{displayText(c.title)}</h3><p>{displayText(c.subtitle)}</p>
                <span className="skill-tag"><Icon name="leaf" />{c.skill}</span>
                <button className="card-start" data-intent={`case:${c.id}`} aria-label={`${c.name}의 이야기 만나기`} onClick={() => onStart(c.id)} onPointerEnter={onPreload} onFocus={onPreload}>이야기 만나기 <Icon name="arrow" /></button>
              </div>
            </article>
          ))}
        </div>
        <div className="principle-note"><Icon name="note" /><p><strong>정답보다 이해.</strong> 아이의 말에서 다음 대화를 찾아요.</p></div>
      </section>
    </main>
  );
}
