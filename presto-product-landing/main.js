const header = document.querySelector('.site-header')
const pageTransition = document.querySelector('.page-transition')
const revealNodes = [...document.querySelectorAll('.reveal')]

function syncHeaderState() {
  if (!header) return
  header.classList.toggle('scrolled', window.scrollY > 12)
}

function setupRevealObserver() {
  if (!('IntersectionObserver' in window)) {
    revealNodes.forEach((node) => node.classList.add('reveal-active'))
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('reveal-active')
        observer.unobserve(entry.target)
      }
    },
    {
      threshold: 0.18,
      rootMargin: '0px 0px -8% 0px',
    },
  )

  revealNodes.forEach((node) => observer.observe(node))
}

window.addEventListener('scroll', syncHeaderState, { passive: true })
window.addEventListener('load', () => {
  syncHeaderState()
  pageTransition?.classList.add('is-hidden')
  setupRevealObserver()
})
