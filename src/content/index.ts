import { injectCalculator } from './inject-calculator'

function run(): void {
  void injectCalculator()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true })
} else {
  run()
}
