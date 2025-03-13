export const animationHandlers = {
  animateOut: async function(ms=800) {
    console.log('animating out');
    Alpine.store('workspace').direction = 'out';
    Alpine.store('workspace').show = false;
    // Wait for animation to complete
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  animateIn: async function(ms=800) {
    console.log('animating in');
    Alpine.store('workspace').direction = 'in';
    Alpine.store('workspace').show = true;
    // Wait for animation to complete

    // expand all the invoice text areas
    setTimeout(() => {
      document.querySelectorAll('textarea[x-autoexpand]').forEach(el => {
        el.style.height = '';
        el.style.height = el.scrollHeight+1 + 'px';
      });
    }, ms);
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  startWorking: async function() {
    await this.animateOut(200);
    Alpine.store('workspace').isNewPage = false;
    await new Promise(resolve => setTimeout(resolve, 200));
    await this.animateIn(400);
  }
}; 