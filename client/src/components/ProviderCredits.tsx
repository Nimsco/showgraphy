export function ProviderCredits() {
  return <section className="provider-credits" aria-label="Data credits">
    <a className="provider-credits__tmdb" href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" aria-label="The Movie Database">
      <img src="https://www.themoviedb.org/assets/2/v4/logos/2.0/full-color-green.svg" alt="TMDB" />
    </a>
    <span>Catalog scores and artwork from <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a> and <a href="https://anilist.co/" target="_blank" rel="noreferrer">AniList</a>.</span>
    <small>This product uses the TMDB API but is not endorsed or certified by TMDB.</small>
  </section>;
}
