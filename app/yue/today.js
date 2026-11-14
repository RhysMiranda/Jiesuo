/* Today screen. Placeholder: Task 10 replaces this file. Screens register on window.JyutScreens
   and are called as screen(ctx); ctx = {view, esc, state, data, save, toast, route, drills, journey}. */
(function () {
  "use strict";
  window.JyutScreens = window.JyutScreens || {};
  window.JyutScreens.today = function (ctx) {
    ctx.view.innerHTML = `<section class="stack placeholder"><h1>Today</h1><p class="soft">Your daily practice will appear here. For now, try <a href="#sounds">Sounds</a>.</p></section>`;
  };
})();
