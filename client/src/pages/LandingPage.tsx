import { ArrowDownRight, ArrowRight, Bookmark, ChartNoAxesCombined, Clapperboard, Library, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import { ProviderCredits } from '../components/ProviderCredits';

export function LandingPage() {
  return <div className="landing-page">
    <header className="landing-nav">
      <Link to="/" aria-label="Showgraphy home"><Logo /></Link>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#your-archive">Your archive</a></nav>
      <div className="landing-nav__actions"><Link className="text-link" to="/login">Sign in</Link><Link className="button button--outline" to="/register">Start your journal <ArrowRight size={16} /></Link></div>
    </header>

    <main>
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow"><span className="eyebrow-line" />A personal watch journal</p>
          <h1>Your life,<br /><em>in titles.</em></h1>
          <p className="landing-lede">Keep the stories you watched, the ones still unfolding, and the ones you want to meet next. Together, they make a record of your taste.</p>
          <div className="landing-hero__actions"><Link className="button button--primary" to="/register">Build your watchline <ArrowRight size={17} /></Link><Link className="button button--outline" to="/login">I have an account</Link></div>
          <p className="landing-note"><Bookmark size={14} /> Your collection belongs to you. Share only what you choose.</p>
        </div>
        <div className="poster-composition" aria-label="Illustration of a personal collection of overlapping title frames" role="img">
          <div className="poster-glow" />
          <div className="art-poster art-poster--back"><span className="art-orbit" /><span className="art-poster__rule" /></div>
          <div className="art-poster art-poster--middle"><span className="art-sun" /><span className="art-horizon" /><span className="art-poster__rule" /></div>
          <div className="art-poster art-poster--front"><span className="art-frame-lines" /><span className="art-mark">S</span><span className="art-poster__rule" /></div>
          <div className="watchline-label"><span className="watchline-dot" /><span>Your watchline</span><ArrowDownRight size={15} /></div>
          <div className="composition-caption"><span>Stories collected</span><span>One life, in titles</span></div>
        </div>
      </section>

      <section className="category-marquee" aria-label="Supported entertainment categories"><span>Movies</span><span>Anime</span><span>Drama</span><span>Documentaries</span><span>Television</span><span>And what comes next</span></section>

      <section className="landing-editorial" id="how-it-works">
        <div className="landing-editorial__intro"><p className="eyebrow">A record, not a feed</p><h2>What you watch<br />says something <em>about you.</em></h2></div>
        <div className="landing-editorial__body"><p>Showgraphy gives every title a place in your own collection. Mark where you left off, keep a list for later, and add a rating that means something to you.</p><Link className="inline-arrow" to="/register">Start with one title <ArrowRight size={16} /></Link></div>
      </section>

      <section className="feature-spread" id="your-archive">
        <div className="feature-spread__lead"><div className="feature-icon"><Library size={20} /></div><p className="eyebrow">The library</p><h2>Remember<br />where the story<br /><em>left you.</em></h2><p>Keep completed films beside the series you are still watching. Episode progress, dates, notes, and your rating stay with the title.</p><Link className="inline-arrow" to="/register">Make a library <ArrowRight size={16} /></Link></div>
        <div className="feature-spread__aside">
          <article className="feature-note"><Clapperboard size={18} /><div><h3>Collect by feeling</h3><p>Make a watchlist for the weekend or a collection of dramas worth revisiting.</p></div></article>
          <article className="feature-note"><Play size={18} /><div><h3>Pick up the thread</h3><p>Keep your current episode and season close, so you can return without searching.</p></div></article>
          <article className="feature-note"><ChartNoAxesCombined size={18} /><div><h3>See your own pattern</h3><p>Turn your completed titles and ratings into a private view of what you have explored.</p></div></article>
        </div>
      </section>
    </main>
    <footer className="landing-footer"><Logo /><span>Stories stay with us.</span><ProviderCredits /></footer>
  </div>;
}
