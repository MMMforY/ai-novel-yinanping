
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Download, GitBranch, LoaderCircle, Plus, Sparkles, Upload, X } from 'lucide-react';
import { CHANGE_MODES, LIMITS, type ChangeMode, type GenerationRequest, type GenerationResult, type ServiceConfig } from '../shared/contracts';
import { DEMO_TEXT, DEMO_TITLE } from '../shared/demo';
import { continueStory, newStory, normalizeText, paragraphSpans, rewriteStory, versionOf, type Story, type Worldline, type TextAnchor, type ReadingProgress } from './domain';
import { fetchConfig, generate } from './api';
import { loadStories, saveProgress, saveStory } from './storage';
import { anchorFromRange } from './selection';

type Route = { page: 'home' | 'import' | 'create' | 'read' | 'result'; storyId?: string; versionId?: string };
function parseRoute(): Route {
  const [page, storyId, versionId] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (['read', 'result'].includes(page) && storyId && versionId) return { page: page as 'read' | 'result', storyId, versionId };
  return { page: page === 'import' || page === 'create' ? page : 'home' };
}
function Brand() {
  return <span className="brand"><svg width="27" height="34" viewBox="0 0 40 48" aria-hidden="true"><path d="M20 2C10 2 3 10 3 20c0 11 17 25 17 25s17-14 17-25C37 10 30 2 20 2Z" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="20" cy="19" r="5" fill="#5F51A6"/></svg>迭页</span>;
}
function Eyebrow({ children }: { children: ReactNode }) { return <div className="eyebrow"><span />{children}</div>; }
function ModeBadge({ config }: { config: ServiceConfig | null }) {
  return <span className={'mode-badge ' + (config?.mode === 'live' ? 'live' : '')}>{config ? config.mode === 'demo' ? '演示模式' : config.ready ? '真实模型' : '待配置模型' : '连接本地服务…'}</span>;
}
function ErrorNotice({ text }: { text: string }) { return text ? <div className="error-notice" role="alert">{text}</div> : null; }
function Busy({ text }: { text: string }) { return <div className="busy" role="status"><LoaderCircle size={17} className="spin" />{text}</div>; }
function BookCover({ title, compact = false }: { title: string; compact?: boolean }) {
  return <div className={'book-cover ' + (compact ? 'compact' : '')} aria-hidden="true"><i /><i /><span className="cover-star" /><strong>{compact ? title.slice(0, 1) : title.slice(0, 12)}</strong><small>ANOTHER POSSIBILITY</small></div>;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [stories, setStories] = useState<Story[]>([]);
  const storiesRef = useRef<Story[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState<ServiceConfig | null>(null);
  const [serviceError, setServiceError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const job = useRef<{ token: number; controller: AbortController | null }>({ token: 0, controller: null });
  const [modal, setModal] = useState<'rewrite' | 'future' | null>(null);
  const [anchor, setAnchor] = useState<TextAnchor | null>(null);
  const [intent, setIntent] = useState('');
  const [changeMode, setChangeMode] = useState<ChangeMode>('minimal');
  const [importTitle, setImportTitle] = useState('');
  const [importText, setImportText] = useState('');
  const importedFile = useRef<{ raw: string; displayed: string } | null>(null);
  const [background, setBackground] = useState('');
  const [idea, setIdea] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'worldlines'>('all');

  const replaceStories = useCallback((next: Story[]) => {
    storiesRef.current = next;
    setStories(next);
  }, []);
  const cancel = useCallback(() => {
    job.current.token++;
    job.current.controller?.abort();
    job.current.controller = null;
    setPending(null);
  }, []);
  useEffect(() => {
    const handle = () => { cancel(); setModal(null); setAnchor(null); setError(''); setRoute(parseRoute()); };
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, [cancel]);
  useEffect(() => { if (route.page !== 'read') window.scrollTo(0, 0); }, [route.page, route.storyId, route.versionId]);
  const reloadService = useCallback(() => {
    setServiceError('');
    fetchConfig().then(setConfig).catch(e => setServiceError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    loadStories().then(s => { if (active) { replaceStories(s); setLoaded(true); } })
      .catch(e => { if (active) { setStorageError(e.message); setLoaded(true); } });
    reloadService();
    return () => { active = false; };
  }, [reloadService, replaceStories]);
  useEffect(() => () => job.current.controller?.abort(), []);

  function navigate(path: string) {
    cancel(); setModal(null); setAnchor(null); setError('');
    if (window.location.hash === '#' + path) { setRoute(parseRoute()); return; }
    window.location.hash = path;
  }
  async function commit(story: Story) {
    // Preserve progress collected while a generation request was running.
    const current = storiesRef.current.find(s => s.id === story.id);
    const merged = { ...story, versions: story.versions.map(v => {
      const previous = current?.versions.find(p => p.id === v.id);
      return previous && previous.body === v.body ? { ...v, progress: previous.progress } : v;
    }) };
    await saveStory(merged);
    replaceStories([merged, ...storiesRef.current.filter(s => s.id !== story.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }
  async function openStory(story: Story, versionId = story.activeVersionId, page: 'read' | 'result' = 'read') {
    try { await commit({ ...story, activeVersionId: versionId }); navigate('/' + page + '/' + story.id + '/' + versionId); }
    catch (e) { setStorageError((e as Error).message); }
  }
  const progress = useCallback((storyId: string, versionId: string, value: ReadingProgress) => {
    const next = storiesRef.current.map(s => s.id === storyId ? { ...s, versions: s.versions.map(v => v.id === versionId ? { ...v, progress: value } : v) } : s);
    replaceStories(next);
    saveProgress(storyId, versionId, value).catch(e => setStorageError(e.message));
  }, [replaceStories]);

  async function run(request: GenerationRequest, label: string, finish: (result: GenerationResult, token: number) => Promise<void>) {
    if (job.current.controller) return;
    setError('');
    if (!config?.ready) { setError(config?.message || '本地服务尚未就绪，请稍后重试。'); return; }
    const token = ++job.current.token, controller = new AbortController();
    job.current.controller = controller; setPending(label);
    try {
      const result = await generate(request, controller.signal);
      if (job.current.token !== token || controller.signal.aborted) return;
      await finish(result, token);
    } catch (e) {
      if (job.current.token === token && !controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (job.current.token === token) { job.current.controller = null; setPending(null); }
    }
  }
  const currentStory = stories.find(s => s.id === route.storyId);
  const currentVersion = currentStory?.versions.find(v => v.id === route.versionId);
  const original = currentStory?.versions.find(v => v.kind === 'original');
  const generationReady = Boolean(config?.ready && !serviceError);

  async function importStory(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending('正在保存故事…'); setError('');
    try {
      const originalInput = importedFile.current?.displayed === importText ? importedFile.current.raw : importText;
      const story = newStory(importTitle, originalInput, 'import', background.trim());
      await commit(story); navigate('/read/' + story.id + '/' + story.activeVersionId);
      setImportText(''); setImportTitle(''); setBackground(''); importedFile.current = null;
    } catch (e) { setError((e as Error).message); }
    finally { setPending(null); }
  }
  async function readTxt(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      if (!file.name.toLowerCase().endsWith('.txt')) throw new Error('首版支持 UTF-8 TXT 文件，请选择 .txt 文稿。');
      if (file.size > 120_000) throw new Error('TXT 文件最多支持 120KB，正文最多 30,000 字。请先截取需要阅读的片段。');
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
      const readableText = normalizeText(text);
      if (!readableText || text.length > LIMITS.story) throw new Error('请导入 1—30,000 字的 UTF-8 文本。原有输入已保留。');
      // Textareas normalize CR/CRLF themselves. Keep the untouched file separately.
      const displayed = text.replace(/\r\n?/g, '\n');
      importedFile.current = { raw: text, displayed };
      setImportText(displayed); setImportTitle(file.name.replace(/\.txt$/i, '').slice(0, 80));
    } catch (e) { setError(e instanceof TypeError ? '文件不是有效的 UTF-8 文本，请转换编码后重试。原有输入已保留。' : (e as Error).message); }
  }
  async function openDemo() {
    const existing = storiesRef.current.find(s => s.source === 'demo');
    if (existing) return openStory(existing);
    setError('');
    try {
      const story = newStory(DEMO_TITLE, DEMO_TEXT, 'demo', '原创演示片段。雾港、渡口和灯塔；林舟与苏晚寻找事故真相。');
      await commit(story); navigate('/read/' + story.id + '/' + story.activeVersionId);
    } catch (e) { setStorageError((e as Error).message); }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    return run({ operation: 'create', title: '', intent: idea.trim(), mode: 'reasonable',
      context: { before: '', selected: '', after: '', background: '', genres } }, '故事正在展开…',
    async (result, token) => {
      const story = newStory(result.title, result.text, 'created', idea.trim(), result);
      if (job.current.token !== token) return;
      await commit(story);
      if (job.current.token !== token) return;
      navigate('/read/' + story.id + '/' + story.activeVersionId); setIdea(''); setGenres([]);
    });
  }
  function openRewrite(value: TextAnchor) {
    if (pending) return;
    setAnchor(value); setIntent(''); setChangeMode('minimal'); setError(''); setModal('rewrite');
    window.getSelection()?.removeAllRanges();
  }
  function submitChange(event?: FormEvent) {
    event?.preventDefault();
    return performChange(modal === 'rewrite' ? anchor : null, intent.trim(), changeMode);
  }
  function performChange(selected: TextAnchor | null, wish: string, mode: ChangeMode) {
    if (!currentStory || !currentVersion) return;
    const sourceVersion = selected ? versionOf(currentStory, selected.versionId) : currentVersion;
    const storyId = currentStory.id, versionId = sourceVersion.id, sourceBody = sourceVersion.body;
    if (selected && !wish) return;
    const request: GenerationRequest = {
      operation: selected ? 'rewrite' : 'continue', versionId, title: currentStory.title, intent: wish, mode,
      context: { before: selected ? sourceBody.slice(0, selected.start) : sourceBody,
        selected: selected?.text || '', after: selected ? sourceBody.slice(selected.end) : '',
        background: currentStory.background, genres: [] },
    };
    return run(request, selected ? '正在寻找另一种命运…' : '后面的故事正在展开…', async (result, token) => {
      const latest = storiesRef.current.find(s => s.id === storyId);
      if (!latest || versionOf(latest, versionId).body !== sourceBody || job.current.token !== token) return;
      const updated = selected ? rewriteStory(latest, selected, wish, mode, result) : continueStory(latest, versionId, wish, result);
      await commit(updated);
      if (job.current.token !== token) return;
      navigate('/' + (selected ? 'result' : 'read') + '/' + storyId + '/' + updated.activeVersionId);
    });
  }
  function continueReading() {
    if (window.scrollY < document.documentElement.scrollHeight - window.innerHeight - 100) {
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); return;
    }
    return performChange(null, '', 'reasonable');
  }
  function closeModal() { cancel(); setModal(null); setError(''); }

  return <div className="app">
    <header className={'site-header ' + (route.page === 'read' ? 'reader-header' : '')}>
      {route.page === 'home' ? <Brand /> : <button className="icon-button" aria-label="返回首页" onClick={() => navigate('/')}><ArrowLeft size={21} /></button>}
      {route.page === 'home' ? <nav className="desktop-nav" aria-label="书架导航"><button className={libraryFilter === 'all' ? 'active' : ''} onClick={() => setLibraryFilter('all')}>书架</button><button className={libraryFilter === 'worldlines' ? 'active' : ''} onClick={() => setLibraryFilter('worldlines')}>我的世界线</button></nav>
        : <div className="header-title">{route.page === 'import' ? '导入一个故事' : route.page === 'create' ? '创建一个故事' : currentStory?.title || '故事'}{currentVersion && <small>{route.page === 'result' ? '命运已分叉' : currentVersion.kind === 'original' ? '原来的故事' : currentVersion.title}</small>}</div>}
      <ModeBadge config={config} />
    </header>
    {serviceError || (config && !config.ready) ? <div className="global-notice" role="alert">{serviceError || config?.message}<button onClick={reloadService}>重新连接</button></div> : null}
    {storageError && <div className="global-notice" role="alert">{storageError}<button onClick={() => { setStorageError(''); loadStories().then(replaceStories).catch(e => setStorageError(e.message)); }}>重试读取</button></div>}

    {route.page === 'home' && <main className="home page-width">
      <section className="hero"><div className="hero-if" aria-hidden="true">IF</div><Eyebrow>AI 故事工作台</Eyebrow>
        <h1>故事不该只有<br/><em>一种命运。</em></h1>
        <p className="hero-copy">读到不甘心的地方，就亲手改写它。<br className="desktop-only"/>从一句念头开始，也可以长成一个世界。</p>
        <div className="hero-actions"><button className="button primary" onClick={() => navigate('/create')}><Sparkles size={18}/>开始一个故事</button><button className="button" onClick={() => navigate('/import')}><Download size={18}/>导入已有故事</button></div>
      </section>
      {!loaded ? <Busy text="正在打开你的书架…"/> : stories[0] && <section className="continue-card">
        <BookCover title={stories[0].title}/><div className="continue-info"><span className="small-label">正在阅读</span><h2>{stories[0].title}</h2><p>{versionOf(stories[0], stories[0].activeVersionId).title}</p><div className="progress-label"><span>阅读进度</span><span>{Math.round(versionOf(stories[0], stories[0].activeVersionId).progress.ratio * 100)}%</span></div><div className="progress-track"><span style={{ width: versionOf(stories[0], stories[0].activeVersionId).progress.ratio * 100 + '%' }}/></div><button className="text-button" onClick={() => openStory(stories[0])}>继续阅读 <ArrowRight size={15}/></button></div>
      </section>}
      <section className="shelf" id="shelf"><span className="english-label">RECENT STORIES</span><div className="section-heading"><h2>{libraryFilter === 'worldlines' ? '我的世界线' : '最近的故事'}</h2><span>{stories.length} 个故事 · 保存在本地</span></div>
        {loaded && (stories.filter(s => libraryFilter === 'all' || s.versions.length > 1).length ? <div className="story-grid">{stories.filter(s => libraryFilter === 'all' || s.versions.length > 1).map(story => <button className="story-card" key={story.id} onClick={() => openStory(story)}>
          <BookCover title={story.title} compact/><div><h3>{story.title}</h3><span className="small-label">{story.source === 'demo' ? '原创演示' : story.source === 'import' ? '导入故事' : '从一句念头开始'} · {story.versions.length - 1} 条世界线</span><p>{story.originalText.slice(0, 55)}</p></div><ChevronRight size={18}/></button>)}</div>
          : <div className="empty-shelf"><GitBranch size={29}/><h3>{libraryFilter === 'worldlines' ? '你还没有改变过故事的命运。' : '你的第一条世界线，从这里开始。'}</h3><p>先读一段原创故事，试着让那个来不及的瞬间，变得来得及。</p><button className="button" onClick={openDemo}>体验原创演示 <ArrowRight size={16}/></button></div>)}
      </section>
      {stories.length > 0 && <button className="demo-link text-button" onClick={openDemo}>打开原创演示「雨停之前」<ArrowRight size={14}/></button>}
      <footer className="page-footer"><Brand/><span>给故事，另一种可能。<small>本地版 · 无需账号</small></span></footer>
    </main>}

    {(route.page === 'import' || route.page === 'create') && <main className="form-page">
      <Eyebrow>{route.page === 'import' ? '让故事从原文继续生长' : '一个念头就够了'}</Eyebrow>
      <h1>{route.page === 'import' ? <>把你放不下的<br/>故事带进来。</> : <>你最近，<br/>想看什么？</>}</h1>
      <p className="form-intro">{route.page === 'import' ? '粘贴小说片段或章节。保留原来的故事，给你放不下的那一幕另一种可能。' : '不用写大纲。告诉我们你脑海里最想看到的一幕，剩下的交给故事。'}</p>
      {route.page === 'import' ? <form onSubmit={importStory}>
        <label className="field-label" htmlFor="import-title">故事名称<span>可选</span></label><input id="import-title" value={importTitle} onChange={e => setImportTitle(e.target.value)} maxLength={80} placeholder="给这个故事起一个名字"/>
        <label className="field-label" htmlFor="story-text">故事正文<span className={importText.length > LIMITS.story ? 'over-limit' : ''}>{importText.length.toLocaleString()} / 30,000 字</span></label>
        <textarea id="story-text" className="story-input" value={importText} onChange={e => { importedFile.current = null; setImportText(e.target.value); }} placeholder="在这里粘贴正文……&#10;&#10;例如：雨还在下。末班船即将离岸，她站在栈桥尽头，回过头说，等我回来。"/>
        <div className="file-drop"><Upload size={19}/><div>也可以上传文稿<small>UTF-8 TXT · 最多 120KB / 30,000 字</small></div><label className="file-button">选择文件<input aria-label="选择 TXT 文件" type="file" accept=".txt,text/plain" onChange={e => { void readTxt(e.target.files?.[0]); e.target.value = ''; }}/></label></div>
        <details className="background-details"><summary><Plus size={14}/>补充故事背景</summary><textarea aria-label="故事背景" value={background} onChange={e => setBackground(e.target.value)} maxLength={LIMITS.background} placeholder="可以补充人物关系、前情或需要保留的设定。"/></details>
        <button type="button" className="text-button sample-button" onClick={() => { importedFile.current = null; setImportText(DEMO_TEXT); setImportTitle(DEMO_TITLE); setError(''); }}>填入原创示例「雨停之前」<ArrowRight size={14}/></button>
        <p className="privacy-copy"><Check size={14}/>故事保存在当前浏览器。使用模型生成时，相关文本会发送给所配置的模型服务。</p>
        <ErrorNotice text={error}/>{pending && <Busy text={pending}/>}
        <button className="button primary full-width" disabled={!importText.trim() || importText.length > LIMITS.story || Boolean(pending)}>导入并开始阅读 <ArrowRight size={17}/></button>
      </form> : <form onSubmit={create}>
        <label className="field-label" htmlFor="story-idea">故事灵感<span>一句话也可以</span></label><textarea id="story-idea" value={idea} onChange={e => setIdea(e.target.value)} maxLength={LIMITS.intent} placeholder="例如：一个普通大学生突然发现，自己能看见别人的命运……"/>
        <div className="field-label">故事类型<span>可选 · 最多 3 个</span></div><div className="genre-tags">{['都市', '玄幻', '校园', '恋爱', '悬疑', '穿越', '修仙', '科幻'].map(g => <button key={g} type="button" aria-pressed={genres.includes(g)} className={genres.includes(g) ? 'selected' : ''} disabled={!genres.includes(g) && genres.length >= 3} onClick={() => setGenres(genres.includes(g) ? genres.filter(v => v !== g) : [...genres, g])}>{g}{genres.includes(g) && <Check size={13}/>}</button>)}</div>
        <button className="inspiration-button" type="button" onClick={() => setIdea('一个收到未来来信的大学生，决定在最后一班船离岸前，救下那个不该消失的人。')}><Sparkles size={17}/>没有灵感？<span>替我想一个 →</span></button>
        <p className="privacy-copy">故事保存在当前浏览器。使用模型生成时，你的想法会发送给所配置的模型服务。</p>
        <ErrorNotice text={error}/>{pending && <Busy text={pending}/>}
        <button className="button primary full-width" disabled={!idea.trim() || Boolean(pending) || !generationReady}>让故事开始 <ArrowRight size={17}/></button>
      </form>}
    </main>}

    {loaded && (route.page === 'read' || route.page === 'result') && (!currentStory || !currentVersion) && <main className="empty-page"><h1>这段故事暂时找不到了。</h1><p>故事保存在创建它的浏览器中。</p><button className="button" onClick={() => navigate('/')}>回到书架</button></main>}
    {route.page === 'read' && currentStory && currentVersion && <Reader key={currentVersion.id} story={currentStory} version={currentVersion}
      onRewrite={openRewrite} onProgress={progress} onSwitch={id => openStory(currentStory, id)}
      onContinue={continueReading} onFuture={() => { setIntent(''); setError(''); setModal('future'); }}
      pending={pending} error={modal ? '' : error}/>} 
    {route.page === 'result' && currentStory && currentVersion && <WorldlineResult story={currentStory} version={currentVersion}
      onContinue={() => openStory(currentStory, currentVersion.id)}
      onOriginal={() => original && openStory(currentStory, original.id)}
      onRetry={() => { const previous = currentVersion.intervention; if (previous?.anchor) openRewrite({ ...previous.anchor, versionId: previous.anchor.versionId }); }}/>}

    {modal && currentStory && currentVersion && <ChangeDialog kind={modal} anchor={anchor} intent={intent} setIntent={setIntent} mode={changeMode} setMode={setChangeMode}
      error={error} pending={pending} ready={generationReady} onClose={closeModal} onSubmit={submitChange}/>}
  </div>;
}

function Reader({ story, version, onRewrite, onProgress, onSwitch, onContinue, onFuture, pending, error }: {
  story: Story; version: Worldline; onRewrite: (a: TextAnchor) => void;
  onProgress: (storyId: string, versionId: string, p: ReadingProgress) => void;
  onSwitch: (id: string) => void; onContinue: () => void; onFuture: () => void; pending: string | null; error: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ anchor: TextAnchor; left: number; top: number } | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [fontSize, setFontSize] = useState(() => window.matchMedia('(max-width: 760px)').matches ? 17 : 19);
  const [settings, setSettings] = useState(false);
  const progressCallback = useRef(onProgress);
  progressCallback.current = onProgress;
  useEffect(() => {
    let restored = false, timer: ReturnType<typeof setTimeout> | undefined;
    let latest = { ...version.progress };
    const restore = requestAnimationFrame(() => {
      window.scrollTo(0, version.progress.scrollY); restored = true;
    });
    const collect = () => {
      if (!restored) return;
      progressCallback.current(story.id, version.id, latest);
    };
    const onScroll = () => {
      if (!restored) return;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      latest = { scrollY: Math.max(0, window.scrollY), ratio: max ? Math.min(1, window.scrollY / max) : 1 };
      clearTimeout(timer); timer = setTimeout(collect, 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(restore); clearTimeout(timer); window.removeEventListener('scroll', onScroll); collect(); };
    // Restore once per version; appending text should not reset the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id, version.id]);
  useEffect(() => {
    const readSelection = () => {
      const current = window.getSelection();
      if (!root.current || !current?.rangeCount || current.isCollapsed) { setSelection(null); return; }
      const range = current.getRangeAt(0), anchor = anchorFromRange(root.current, range, version.body, version.id);
      if (!anchor) { setSelection(null); return; }
      if (anchor.text.length > LIMITS.selection) { setSelectionError('一次请选中不超过 2,000 字的片段。'); setSelection(null); return; }
      setSelectionError('');
      const bounds = range.getBoundingClientRect();
      setSelection({ anchor, left: Math.max(16, Math.min(window.innerWidth - 178, bounds.left + bounds.width / 2 - 80)), top: Math.max(87, Math.min(window.innerHeight - 145, bounds.top - 48)) });
    };
    document.addEventListener('selectionchange', readSelection);
    window.addEventListener('scroll', readSelection, { passive: true });
    window.addEventListener('resize', readSelection);
    return () => {
      document.removeEventListener('selectionchange', readSelection);
      window.removeEventListener('scroll', readSelection);
      window.removeEventListener('resize', readSelection);
    };
  }, [version.body, version.id]);
  const demo = version.generations.some(g => g.mode === 'demo') || story.source === 'demo';
  return <main className="reader-page">
    <div className="reading-progress-bar" aria-hidden="true"><span style={{ width: version.progress.ratio * 100 + '%' }}/></div>
    <div className="reader-toolbar"><label><GitBranch size={15}/><select aria-label="故事版本" value={version.id} onChange={e => onSwitch(e.target.value)}>{story.versions.map((v, i) => <option key={v.id} value={v.id}>{v.kind === 'original' ? '原版' : '世界线 ' + String(i).padStart(2, '0') + ' · ' + v.title}</option>)}</select></label><button className="text-button font-button" aria-expanded={settings} onClick={() => setSettings(!settings)}>Aa</button></div>
    {settings && <div className="reader-settings"><label htmlFor="font-size">字号</label><input id="font-size" type="range" min={16} max={25} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}/><span>{fontSize}</span></div>}
    <article className="reading-article"><header className="chapter-heading"><span className="english-label">{version.kind === 'original' ? 'THE ORIGINAL STORY' : 'YOUR WORLDLINE'}</span><h1>{version.kind === 'original' ? story.title : version.title}</h1><div className="chapter-ornament" aria-hidden="true"><span/>◇<span/></div>{demo && <p className="demo-caption">{story.source === 'demo' ? '原创演示故事' : '含演示生成内容'} · 可选中任一片段改写</p>}</header>
      <div ref={root} className="story-body" data-testid="story-body" style={{ fontSize }}>{paragraphSpans(version.body).map((p, i) => <div className="paragraph" key={p.start}><p data-text-start={p.start} data-text-end={p.end}>{p.text}</p><button className="paragraph-action" aria-label={'改写第 ' + (i + 1) + ' 段'} title="改写这一段" onClick={() => p.text.length <= LIMITS.selection ? onRewrite({ versionId: version.id, start: p.start, end: p.end, text: p.text }) : setSelectionError('这一段较长，请选中其中不超过 2,000 字的部分。')}><Sparkles size={14}/></button></div>)}</div>
      <div className="chapter-end"><span>— 故事尚未结束 —</span><span><GitBranch size={14}/>{version.kind === 'original' ? '原来的故事' : '我的世界线'}</span></div>
      <p className="reader-hint">读到不甘心的地方，选中文字，改写这一幕。</p>
      <ErrorNotice text={selectionError || error}/>
    </article>
    {selection && !pending && <button className="selection-popover" style={{ left: selection.left, top: selection.top }} onPointerDown={e => e.preventDefault()} onClick={() => onRewrite(selection.anchor)}><Sparkles size={16}/>改写这一幕</button>}
    <div className="reader-actions">{pending && <Busy text={pending}/>}<div><button className="text-button" onClick={onFuture} disabled={Boolean(pending)}><Sparkles size={16}/>干预接下来的剧情</button><button className="button primary" onClick={onContinue} disabled={Boolean(pending)}>继续阅读 <ArrowRight size={16}/></button></div></div>
  </main>;
}

function ChangeDialog({ kind, anchor, intent, setIntent, mode, setMode, error, pending, ready, onClose, onSubmit }: {
  kind: 'rewrite' | 'future'; anchor: TextAnchor | null; intent: string; setIntent: (v: string) => void;
  mode: ChangeMode; setMode: (v: ChangeMode) => void; error: string; pending: string | null; ready: boolean;
  onClose: () => void; onSubmit: (e: FormEvent) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { ref.current?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className="change-dialog" aria-labelledby="change-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="sheet-handle" aria-hidden="true"/><button className="dialog-close icon-button" aria-label={pending ? '取消生成并关闭' : '关闭弹层'} onClick={onClose}><X size={21}/></button>
    <Eyebrow>故事还有另一种可能</Eyebrow><h2 id="change-title">{kind === 'rewrite' ? '改写这一幕' : '干预接下来的剧情'}</h2>
    {kind === 'rewrite' && anchor && <blockquote className="selected-excerpt">{anchor.text}</blockquote>}
    <form onSubmit={onSubmit}><label htmlFor="change-intent" className="field-label">{kind === 'rewrite' ? '你希望发生什么？' : '你想让接下来发生什么？'}<span>{kind === 'future' ? '可留空，继续故事' : ''}</span></label>
      <textarea id="change-intent" autoFocus value={intent} disabled={Boolean(pending)} onChange={e => setIntent(e.target.value)} maxLength={LIMITS.intent} placeholder={kind === 'rewrite' ? '例如：她不要死，让有人及时赶到。' : '例如：他们终于找到灯塔里的秘密……'}/>
      {kind === 'rewrite' && <><div className="quick-wishes">{['让她活下来', '有人及时赶到', '换一个结局'].map(w => <button key={w} type="button" disabled={Boolean(pending)} onClick={() => setIntent(w)}>{w}</button>)}</div>
        <div className="field-label">改动程度</div><div className="change-modes" role="group" aria-label="改动程度">{CHANGE_MODES.map(m => <button type="button" key={m.id} disabled={Boolean(pending)} aria-pressed={mode === m.id} className={mode === m.id ? 'selected' : ''} onClick={() => setMode(m.id)}>{m.label}</button>)}</div><p className="mode-help">{CHANGE_MODES.find(m => m.id === mode)?.help}</p></>}
      <ErrorNotice text={error}/>{pending && <Busy text={pending}/>}
      <button className="button primary full-width" disabled={Boolean(pending) || !ready || (kind === 'rewrite' && !intent.trim())}>{kind === 'rewrite' ? '改变命运' : intent.trim() ? '让故事向这里生长' : '让故事继续'}<ArrowRight size={17}/></button>
      {pending && <button className="text-button cancel-generation" type="button" onClick={onClose}>取消这次生成</button>}
    </form>
  </dialog>;
}

function WorldlineResult({ story, version, onContinue, onOriginal, onRetry }: {
  story: Story; version: Worldline; onContinue: () => void; onOriginal: () => void; onRetry: () => void;
}) {
  const [tab, setTab] = useState<'before' | 'after'>('after');
  const change = version.intervention, source = change?.sourceText || story.originalText;
  const changedAt = change?.anchor?.start || 0;
  const start = paragraphSpans(source).find(p => p.start <= changedAt && p.end >= changedAt)?.start ?? changedAt;
  const before = source.slice(start, start + 1500), after = version.body.slice(start);
  const index = story.versions.findIndex(v => v.id === version.id);
  return <main className="result-page page-width">
    <section className="result-heading"><div><Eyebrow>WORLDLINE {String(index + 1).padStart(2, '0')}</Eyebrow><div className="worldline-graph" aria-hidden="true"><span className="line-original"/><span className="line-new"/><i/><small>改写前</small><strong>你的世界线</strong></div></div><h1>另一个结局，<br/>从这里开始。</h1></section>
    <div className="result-tabs"><button className={tab === 'before' ? 'active' : ''} onClick={() => setTab('before')}>改写前</button><button className={tab === 'after' ? 'active' : ''} onClick={() => setTab('after')}>你的世界线</button></div>
    <div className="comparison-grid">
      <section className={'comparison-card before-card ' + (tab === 'before' ? 'mobile-visible' : '')}><header><span className="status-dot"/><div><small>改写前的故事</small><h2>那个来不及的瞬间</h2></div><strong>01</strong></header><div className="comparison-body">{paragraphSpans(before).map(p => <p key={p.start}>{p.text}</p>)}</div></section>
      <section className={'comparison-card after-card ' + (tab === 'after' ? 'mobile-visible' : '')}><header><span className="status-dot"/><div><small>我的世界线{version.generations.some(g => g.mode === 'demo') ? ' · 演示生成' : ''}</small><h2>{version.title}</h2></div><strong>{String(index + 1).padStart(2, '0')}</strong></header><div className="comparison-body" data-testid="rewritten-body">{paragraphSpans(after).map(p => <p key={p.start}>{p.start <= changedAt - start && p.end > changedAt - start ? <>{p.text.slice(0, Math.max(0, changedAt - start - p.start))}<mark>{p.text.slice(Math.max(0, changedAt - start - p.start))}</mark></> : p.text}</p>)}</div></section>
    </div>
    <section className="result-actions"><div><span className="small-label">改写依据</span><p>“{change?.intent || '让故事继续'}”</p><small>{CHANGE_MODES.find(m => m.id === change?.mode)?.label} · <Check size={12}/>已保存在本地</small></div><div className="result-buttons"><button className="button primary" onClick={onContinue}>沿这条世界线继续 <ArrowRight size={16}/></button><button className="button" onClick={onOriginal}>返回原版</button>{change?.anchor && <button className="text-button" onClick={onRetry}>再改一次</button>}</div></section>
  </main>;
}
