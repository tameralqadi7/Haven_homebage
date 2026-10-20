(function () {
  "use strict";

  const PAGE_TRANSITION = 0.9;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const EASE = {
    circOut: "cubic-bezier(0, 0.55, 0.45, 1)",
    easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
    easeOut: "cubic-bezier(0, 0, 0.58, 1)",
    expoOut: "cubic-bezier(0.19, 1, 0.22, 1)",
    spring: "cubic-bezier(0.3, 1.3, 0.55, 1)"
  };

  const page = document.getElementById("page");
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, t) => from + (to - from) * t;

  function cubicBezier(x1, y1, x2, y2) {
    const sample = (a1, a2, t) => ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + 3 * a1 * t;
    const slope = (a1, a2, t) => 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const error = sample(x1, x2, t) - x;
        const d = slope(x1, x2, t);
        if (Math.abs(error) < 1e-6 || d === 0) break;
        t -= error / d;
      }
      return sample(y1, y2, clamp(t, 0, 1));
    };
  }

  const easeOutFn = cubicBezier(0, 0, 0.58, 1);
  const galleryClipFn = cubicBezier(0.6, 0, 0.69, 0.22);
  const circOutFn = (t) => Math.sqrt(1 - Math.pow(1 - clamp(t, 0, 1), 2));

  function calculateDelay(order, blockIndex, extra) {
    return 0.3 * order + (blockIndex === 0 ? 0.7 : 0) + (extra || 0);
  }

  function animate(el, keyframes, duration, delay, easing) {
    return el.animate(keyframes, {
      duration: reduceMotion ? 0 : duration * 1000,
      delay: reduceMotion ? 0 : delay * 1000,
      easing: easing,
      fill: "both"
    });
  }

  const viewport = { width: 0, height: 0, lvh: 0, desktop: false };
  const lvhProbe = document.createElement("div");
  lvhProbe.style.cssText = "position:fixed;top:0;height:100lvh;width:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(lvhProbe);

  function measureViewport() {
    viewport.width = window.innerWidth;
    viewport.height = document.documentElement.clientHeight;
    viewport.lvh = lvhProbe.offsetHeight || window.innerHeight;
    viewport.desktop = viewport.width >= 1024;
  }

  measureViewport();


  let lenis = null;

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  if (typeof Lenis !== "undefined") {
    lenis = new Lenis();
    window.lenis = lenis;
    lenis.scrollTo(0, { immediate: true });
    lenis.stop();
  } else {
    document.documentElement.style.overflow = "hidden";
  }

  setTimeout(function () {
    if (lenis) lenis.start();
    else document.documentElement.style.overflow = "";
  }, reduceMotion ? 0 : 1700);


  function offsetTop(el) {
    let top = 0;
    while (el) {
      top += el.offsetTop;
      el = el.offsetParent;
    }
    return top;
  }

  function resolveEdge(edge, length) {
    if (edge === "start") return 0;
    if (edge === "center") return length / 2;
    if (edge === "end") return length;
    if (edge.endsWith("px")) return parseFloat(edge);
    if (edge.endsWith("vh")) return (parseFloat(edge) / 100) * viewport.height;
    if (edge.endsWith("%")) return (parseFloat(edge) / 100) * length;
    return parseFloat(edge) * length;
  }

  function scrollTracker(el, offsets) {
    const tracker = { el: el, offsets: offsets, from: 0, to: 1 };
    tracker.measure = function () {
      const top = offsetTop(el);
      const height = el.clientHeight;
      const points = offsets.map(function (pair) {
        const parts = pair.split(" ");
        return top + resolveEdge(parts[0], height) - resolveEdge(parts[1], viewport.height);
      });
      tracker.from = points[0];
      tracker.to = points[1];
    };
    tracker.progress = function (scrollY) {
      if (tracker.to === tracker.from) return scrollY >= tracker.to ? 1 : 0;
      return clamp((scrollY - tracker.from) / (tracker.to - tracker.from), 0, 1);
    };
    return tracker;
  }

  const trackers = [];
  function track(el, offsets) {
    const tracker = scrollTracker(el, offsets);
    trackers.push(tracker);
    return tracker;
  }


  const blocks = new Map();

  function queue(blockIndex, factory) {
    if (!blocks.has(blockIndex)) blocks.set(blockIndex, []);
    const animation = factory();
    animation.pause();
    blocks.get(blockIndex).push(animation);
  }

  function blockIndexOf(el) {
    const block = el.closest("[data-block]");
    return block ? parseInt(block.dataset.block, 10) : 1;
  }

  function splitWords(el) {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", words.join(" "));
    el.textContent = "";
    return words.map(function (word) {
      const outer = document.createElement("span");
      outer.className = "split-word";
      outer.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.textContent = word + " ";
      outer.appendChild(inner);
      el.appendChild(outer);
      return inner;
    });
  }

  $$("[data-split]").forEach(function (el) {
    const blockIndex = blockIndexOf(el);
    const order = parseFloat(el.dataset.order || 0);
    const stagger = parseFloat(el.dataset.stagger || 0.05);
    const base = calculateDelay(order, blockIndex);
    splitWords(el).forEach(function (word, i) {
      queue(blockIndex, function () {
        return animate(word, [
          { transform: "translateY(100%) rotate(10deg)" },
          { transform: "translateY(0%) rotate(0deg)" }
        ], 1.2, base + i * stagger, EASE.expoOut);
      });
    });
    el.style.visibility = "visible";
  });

  $$(".DotHeading-dot[data-order]").forEach(function (dot) {
    const blockIndex = blockIndexOf(dot);
    queue(blockIndex, function () {
      return animate(dot, [
        { transform: "translateY(50%) rotate(-45deg) scale(0)" },
        { transform: "translateY(-50%) rotate(0deg) scale(1)" }
      ], 0.7, calculateDelay(parseFloat(dot.dataset.order), blockIndex), EASE.circOut);
    });
  });

  $$(".Divider[data-order]").forEach(function (divider) {
    const blockIndex = blockIndexOf(divider);
    queue(blockIndex, function () {
      return animate(divider, [
        { transform: "scaleX(0)", opacity: 0 },
        { transform: "scaleX(1)", opacity: 1 }
      ], 0.8, calculateDelay(parseFloat(divider.dataset.order), blockIndex), EASE.easeOut);
    });
  });

  $$("[data-rise]").forEach(function (el) {
    const blockIndex = blockIndexOf(el);
    const delay = calculateDelay(parseFloat(el.dataset.order || 0), blockIndex, parseFloat(el.dataset.delay || 0));
    queue(blockIndex, function () {
      return animate(el, [{ transform: "translateY(150%)" }, { transform: "translateY(0)" }], 1.2, delay, EASE.expoOut);
    });
  });

  $$(".quoteIcon").forEach(function (icon) {
    const blockIndex = blockIndexOf(icon);
    queue(blockIndex, function () {
      return animate(icon, [
        { transform: "translateY(50%) rotate(-30deg) scale(0)" },
        { transform: "translateY(0) rotate(0deg) scale(1)" }
      ], 0.8, calculateDelay(0, blockIndex), EASE.circOut);
    });
  });

  function playBlock(blockIndex) {
    (blocks.get(blockIndex) || []).forEach(function (animation) {
      animation.play();
    });
  }

  const revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      playBlock(parseInt(entry.target.dataset.block, 10));
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: "-150px" });

  $$("[data-reveal]").forEach(function (block) {
    revealObserver.observe(block);
  });


  const ICON_PARTS = [
    { order: 0, axis: "scale" },
    { order: 2, axis: "scale" },
    { order: 1, axis: "scale" },
    { order: 2, axis: "scaleX" },
    { order: 3, axis: "scale" },
    { order: 3, axis: "scaleY" },
    { order: 4, axis: "scaleY" }
  ];

  const hidden = (axis) => axis + "(0)";
  const shown = (axis) => axis + "(1)";

  function buildIcon(svg, baseDelay) {
    const parts = Array.from(svg.children);
    let busy = true;

    parts.forEach(function (part, i) {
      const spec = ICON_PARTS[i];
      animate(part, [{ transform: hidden(spec.axis) }, { transform: shown(spec.axis) }], 0.25, baseDelay + 0.25 * spec.order, EASE.easeInOut);
    });
    setTimeout(function () { busy = false; }, (baseDelay + 0.25 * 4 + 0.25) * 1000);

    svg.addEventListener("mouseenter", function () {
      if (busy || reduceMotion) return;
      busy = true;
      const moving = parts.map(function (part, i) {
        return { part: part, spec: ICON_PARTS[i], step: ICON_PARTS[i].order - 1 };
      }).filter(function (item) { return item.spec.order > 0; });
      const maxStep = 3;
      const wait = (0.15 * maxStep + 0.15) * 1000;

      moving.forEach(function (item) {
        item.part.getAnimations().forEach(function (a) { a.cancel(); });
        animate(item.part, [{ transform: shown(item.spec.axis) }, { transform: hidden(item.spec.axis) }], 0.15, (maxStep - item.step) * 0.15, EASE.easeInOut);
      });

      setTimeout(function () {
        moving.forEach(function (item) {
          item.part.getAnimations().forEach(function (a) { a.cancel(); });
          animate(item.part, [{ transform: hidden(item.spec.axis) }, { transform: shown(item.spec.axis) }], 0.15, 0.15 * item.step, EASE.easeInOut);
        });
        setTimeout(function () { busy = false; }, wait);
      }, wait);
    });
  }

  buildIcon($(".Preloader [data-hicon]"), 0);
  buildIcon($(".NavigationDesktop [data-hicon]"), 0);
  buildIcon($(".NavigationFooter [data-hicon]"), PAGE_TRANSITION + 0.3);


  function playIntro() {
    const preloader = $("[data-preloader]");
    const transition = { duration: 0.8, delay: 0.9, ease: EASE.easeInOut };

    animate($(".Preloader-grid"), [
      { top: "50%", transform: "translateY(-150%)" },
      { top: "0px", transform: "translateY(0%)" }
    ], transition.duration, transition.delay, transition.ease);
    animate($(".Preloader-scale"), [
      { transform: "scale(2) translateX(50%)" },
      { transform: "scale(1) translateX(0%)" }
    ], transition.duration, transition.delay, transition.ease);
    animate($(".Preloader-logo"), [
      { transform: "translateX(-50%)" },
      { transform: "translateX(0%)" }
    ], transition.duration, transition.delay, transition.ease);
    animate(preloader, [
      { clipPath: "inset(0 0 0%)" },
      { clipPath: "inset(0 0 100%)" }
    ], 0.6, PAGE_TRANSITION + 0.3, EASE.easeInOut).finished.then(function () {
      preloader.style.display = "none";
    });

    animate($("[data-hero-overlay]"), [
      { clipPath: "inset(0 0 0%)" },
      { clipPath: "inset(0 0 100%)" }
    ], 0.6, PAGE_TRANSITION + 0.3, EASE.easeInOut);

    $$("[data-hero-logo-col]").forEach(function (col) {
      animate(col, [{ transform: "translateY(100lvh)" }, { transform: "translateY(0)" }], 0.8, PAGE_TRANSITION, EASE.circOut);
    });

    animate($("[data-hero-sub]"), [
      { opacity: 0, transform: "translateY(100px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], 0.4, PAGE_TRANSITION + 0.6, EASE.circOut);

    animate($("[data-hero-media]"), [
      { transform: "translateY(50lvh)" },
      { transform: "translateY(0)" }
    ], 0.6, PAGE_TRANSITION + 0.5, EASE.circOut);

    animate($("[data-letstalk]"), [
      { opacity: 0, transform: "translateY(5px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], 0.4, PAGE_TRANSITION + 0.9, EASE.circOut);

    animate($("[data-burger-container]"), viewport.desktop ? [
      { opacity: 0, transform: "translateY(20px) scale(0.95)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ] : [
      { opacity: 0 },
      { opacity: 1 }
    ], viewport.desktop ? 0.5 : 0.1, 1.7, EASE.spring);

    playBlock(0);
  }

  playIntro();


  const burger = $("[data-burger]");
  const burgerButton = $("[data-burger-button]");

  function setMenu(open) {
    burger.classList.toggle("is-open", open);
    burgerButton.setAttribute("aria-expanded", String(open));
    $$(".NavigationBurger-panels, .NavigationBurger-contactPanels", burger).forEach(function (list) {
      list.setAttribute("aria-hidden", String(!open));
    });
  }

  burgerButton.addEventListener("click", function () {
    setMenu(!burger.classList.contains("is-open"));
  });

  document.addEventListener("mousedown", function (event) {
    if (burger.classList.contains("is-open") && !burger.contains(event.target)) setMenu(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setMenu(false);
  });


  document.addEventListener("click", function (event) {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute("href");
    const target = hash === "#" || hash === "#header" ? null : document.getElementById(hash.slice(1));
    if (hash.length > 1 && hash !== "#header" && !target) return;
    event.preventDefault();
    setMenu(false);
    if (lenis) {
      lenis.scrollTo(target || 0, { immediate: reduceMotion });
    } else {
      const top = target ? target.getBoundingClientRect().top + window.scrollY : 0;
      window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
    }
  });


  const footer = $("[data-footer]");
  new IntersectionObserver(function (entries) {
    page.classList.toggle("footerInView", entries[0].isIntersecting);
  }).observe(footer);


  const hero = {
    tracker: track($("[data-hero]"), ["100vh end", "end end"]),
    media: $("[data-hero-media]"),
    sub: $("[data-hero-sub]"),
    subCol: $("[data-hero-sub]").parentElement,
    logos: $$("[data-hero-logo]"),
    descs: $$("[data-hero-desc]"),
    insetLeft: 0,
    insetRight: 0
  };

  hero.measure = function () {
    const rect = hero.sub.getBoundingClientRect();
    hero.insetLeft = rect.left;
    hero.insetRight = window.innerWidth - rect.right;
  };

  hero.update = function (scrollY) {
    const p = hero.tracker.progress(scrollY);
    const e = easeOutFn(p);
    hero.media.style.clipPath = "inset(0px " + hero.insetRight * (1 - e) + "px 0px " + hero.insetLeft * (1 - e) + "px)";
    hero.subCol.style.transform = "translateY(" + 350 * p + "px)";
    hero.logos.forEach(function (el) { el.style.transform = "translateY(" + 400 * p + "px)"; });
    hero.descs.forEach(function (el) { el.style.transform = "translateY(" + 450 * p + "px)"; });
  };


  const GALLERY_ORDER = {
    desktop: [["textTop", "text--size-s"], ["textRight", "h2"], ["textBottom", "text--size-s"], ["textLeft", "h2"]],
    mobile: [["textLeft", "h2"], ["textBottom", "text--size-s"], ["textRight", "h2"], ["textTop", "text--size-s"]]
  };

  const gallery = {
    tracker: track($("[data-gallery]"), ["start end", "end end"]),
    images: $("[data-gallery-images]"),
    items: $$(".ScrollGallery-img-item"),
    textCol: $("[data-gallery-text]"),
    layout: null,
    current: 0
  };

  gallery.arrange = function () {
    const layout = viewport.desktop ? "desktop" : "mobile";
    if (layout === gallery.layout) return;
    gallery.layout = layout;
    GALLERY_ORDER[layout].forEach(function (entry) {
      const item = $('[data-key="' + entry[0] + '"]', gallery.textCol);
      item.className = "ScrollGallery-textItem " + entry[1];
      gallery.textCol.appendChild(item);
    });
    gallery.texts = $$(".ScrollGallery-textItem p", gallery.textCol);
  };

  gallery.update = function (scrollY) {
    const p = gallery.tracker.progress(scrollY);
    const size = viewport.desktop ? 800 : 400;
    const clipEase = galleryClipFn(p);
    const insetY = ((viewport.lvh - size) / 2) * (1 - clipEase);
    const insetX = ((viewport.width - size) / 2) * (1 - clipEase);
    gallery.images.style.transform = "scale(" + lerp(0.2, 1, p) + ")";
    gallery.images.style.clipPath = "inset(" + insetY + "px " + insetX + "px)";

    const last = gallery.items.length - 1;
    const index = clamp(Math.floor(clamp((p - 0.3) / 0.5, 0, 1) * last), 0, last);
    if (index !== gallery.current) {
      gallery.current = index;
      gallery.items.forEach(function (item, i) {
        item.style.display = i <= index ? "block" : "none";
      });
    }

    const shift = (viewport.desktop ? 150 : 50) * (1 - p);
    const t = gallery.texts;
    t[0].style.transform = "translateY(" + shift + "px)";
    t[1].style.transform = "translateX(" + -shift + "px)";
    t[2].style.transform = "translateY(" + -shift + "px)";
    t[3].style.transform = "translateX(" + shift + "px)";
  };


  const parallaxTargets = { "cards-layout": $("[data-cards-layout]") };

  const parallaxItems = $$("[data-parallax]").map(function (figure) {
    return {
      inner: $(".MediaItem-parallax", figure),
      tracker: track(parallaxTargets[figure.dataset.parallax] || figure, ["start end", "end start"])
    };
  }).concat($$("[data-cards-parallax]").map(function (wrapper) {
    return {
      inner: wrapper,
      tracker: track($("[data-cards-layout]"), ["start end", "end start"])
    };
  }));

  function updateParallax(scrollY) {
    parallaxItems.forEach(function (item) {
      const p = item.tracker.progress(scrollY);
      item.inner.style.transform = "translateY(" + lerp(-10, 10, p) + "%)";
    });
  }


  const footerParts = {
    tracker: track(footer, ["start end", "start start"]),
    inner: $("[data-footer-inner]"),
    shade: $("[data-footer-shade]"),
    logoTracker: track($("[data-footer-logo]"), ["start end", "end end"]),
    letters: $$("[data-footer-logo] path")
  };

  function updateFooter(scrollY) {
    const p = footerParts.tracker.progress(scrollY);
    const start = viewport.desktop ? -250 : -100;
    footerParts.inner.style.transform = "translateY(" + lerp(start, 0, easeOutFn(p)) + "px) translateZ(0)";
    footerParts.shade.style.opacity = lerp(0.4, 0, clamp(p / 0.4, 0, 1));

    const logoProgress = footerParts.logoTracker.progress(scrollY);
    footerParts.letters.forEach(function (path, domIndex) {
      if (!viewport.desktop) {
        path.style.transform = "";
        return;
      }
      const letterIndex = footerParts.letters.length - 1 - domIndex;
      const startAt = (letterIndex / 5) * 0.35;
      const local = clamp((logoProgress - startAt) / 0.65, 0, 1);
      path.style.transform = "translateY(" + 300 * (1 - circOutFn(local)) + "px)";
    });
  }


  function Spring(value, stiffness, damping, mass) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
  }

  Spring.prototype.step = function (dt) {
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += (force / this.mass) * h;
      this.value += this.velocity * h;
    }
    if (Math.abs(this.value - this.target) < 0.01 && Math.abs(this.velocity) < 0.01) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  };


  const cards = $$("[data-card]").map(function (card) {
    const state = {
      card: card,
      text: $("[data-card-text]", card),
      spring: new Spring(0, 300, 50, 0.5),
      pointerY: null
    };

    state.follow = function (clientY) {
      const rect = card.getBoundingClientRect();
      if (clientY > rect.top + 32 && clientY < rect.bottom - 32) state.spring.target = clientY - rect.top;
    };

    card.addEventListener("mouseenter", function (event) {
      state.pointerY = event.clientY;
      state.follow(event.clientY);
    });
    card.addEventListener("mousemove", function (event) {
      state.pointerY = event.clientY;
      state.follow(event.clientY);
    });
    card.addEventListener("mouseleave", function () {
      state.pointerY = null;
    });
    window.addEventListener("scroll", function () {
      if (state.pointerY !== null) state.follow(state.pointerY);
    }, { passive: true });

    return state;
  });

  function updateCards(dt) {
    cards.forEach(function (state) {
      state.text.style.top = state.spring.step(dt) + "px";
    });
  }


  const cursor = {
    el: $("[data-cursor]"),
    label: $("[data-cursor-label]"),
    enabled: finePointer && window.innerWidth > 768,
    x: new Spring(-100, 700 / 1.8, 12, 0.1),
    y: new Spring(-100, 700 / 1.8, 12, 0.1),
    states: new Set()
  };

  cursor.render = function () {
    cursor.el.className = ["CustomCursor"].concat(Array.from(cursor.states)).join(" ");
  };

  function cursorTargets(event, callback) {
    for (let node = event.target; node && node !== document.body && node.nodeType === 1; node = node.parentNode) {
      if (event.relatedTarget && node.contains(event.relatedTarget)) break;
      callback(node);
    }
  }

  if (cursor.enabled) {
    page.classList.add("has-cursor");
    cursor.states.add("-hidden");
    cursor.render();

    document.body.addEventListener("pointermove", function (event) {
      cursor.x.target = event.clientX;
      cursor.y.target = event.clientY;
      if (cursor.states.delete("-hidden")) cursor.render();
    });
    document.body.addEventListener("mouseleave", function () {
      cursor.states.add("-hidden");
      cursor.render();
    });
    document.body.addEventListener("mousedown", function () {
      cursor.states.add("-active");
      cursor.render();
    });
    document.body.addEventListener("mouseup", function () {
      cursor.states.delete("-active");
      cursor.render();
    });
    document.body.addEventListener("mouseover", function (event) {
      cursorTargets(event, function (node) {
        if (node.matches("a, button")) cursor.states.add("-pointer");
        if (node.dataset.cursorText) {
          cursor.label.textContent = node.dataset.cursorText;
          cursor.states.add("-text");
        }
        if (node.dataset.cursorArrow !== undefined) cursor.states.add("-arrow");
      });
      cursor.render();
    });
    document.body.addEventListener("mouseout", function (event) {
      cursorTargets(event, function (node) {
        if (node.matches("a, button")) cursor.states.delete("-pointer");
        if (node.dataset.cursorText) cursor.states.delete("-text");
        if (node.dataset.cursorArrow !== undefined) cursor.states.delete("-arrow");
      });
      cursor.render();
    });
  }

  function updateCursor(dt) {
    if (!cursor.enabled) return;
    cursor.el.style.transform = "translate(" + cursor.x.step(dt) + "px, " + cursor.y.step(dt) + "px)";
  }


  function Carousel(root, info) {
    this.slides = $$(".swiper-slide", root);
    this.infoSlides = $$(".swiper-slide", info);
    this.index = 0;
    this.busy = false;
    this.autoplay = true;
    this.speed = 0.55;
    this.slides.forEach(function (slide, i) {
      if (i > 0) slide.style.visibility = "hidden";
    }, this);
    this.infoSlides.forEach(function (slide, i) {
      if (i > 0) slide.style.visibility = "hidden";
    });
    this.schedule();
  }

  Carousel.prototype.schedule = function () {
    clearTimeout(this.timer);
    if (!this.autoplay) return;
    const self = this;
    this.timer = setTimeout(function () { self.go(1); }, 5000);
  };

  Carousel.prototype.stopAutoplay = function () {
    this.autoplay = false;
    clearTimeout(this.timer);
  };

  Carousel.prototype.go = function (direction) {
    if (this.busy) return;
    this.busy = true;
    const total = this.slides.length;
    const from = this.index;
    const to = (from + direction + total) % total;
    const speed = this.speed;
    const self = this;

    const slideOut = this.slides[from];
    const slideIn = this.slides[to];
    const imageOut = $(".media-parallax", slideOut);
    const imageIn = $(".media-parallax", slideIn);
    slideIn.style.visibility = "visible";

    const moves = [
      animate(slideOut, [{ transform: "translateX(0%)" }, { transform: "translateX(" + -direction * 100 + "%)" }], speed, 0, "ease"),
      animate(slideIn, [{ transform: "translateX(" + direction * 100 + "%)" }, { transform: "translateX(0%)" }], speed, 0, "ease"),
      animate(imageOut, [{ transform: "translateX(0%)" }, { transform: "translateX(" + direction * 40 + "%)" }], speed, 0, "ease"),
      animate(imageIn, [{ transform: "translateX(" + -direction * 40 + "%)" }, { transform: "translateX(0%)" }], speed, 0, "ease")
    ];

    const infoOut = this.infoSlides[from];
    const infoIn = this.infoSlides[to];
    infoIn.style.visibility = "visible";
    moves.push(
      animate(infoOut, [{ transform: "translateY(0%)" }, { transform: "translateY(" + -direction * 100 + "%)" }], speed, 0, "ease"),
      animate(infoIn, [{ transform: "translateY(" + direction * 100 + "%)" }, { transform: "translateY(0%)" }], speed, 0, "ease")
    );

    Promise.all(moves.map(function (move) { return move.finished; })).then(function () {
      slideOut.style.visibility = "hidden";
      infoOut.style.visibility = "hidden";
      self.index = to;
      self.busy = false;
      self.schedule();
    });
  };

  const carouselRoot = $("[data-carousel]");
  const carousel = new Carousel($(".BlockListCarousel-mainCarousel", carouselRoot), $("[data-carousel-info]"));

  $("[data-carousel-prev]").addEventListener("click", function () {
    carousel.stopAutoplay();
    carousel.go(-1);
  });
  $("[data-carousel-next]").addEventListener("click", function () {
    carousel.stopAutoplay();
    carousel.go(1);
  });


  $$("[data-video]").forEach(function (player) {
    player.addEventListener("mouseenter", function () { player.dataset.playerHover = "active"; });
    player.addEventListener("mouseleave", function () { player.dataset.playerHover = "idle"; });
  });


  function measureAll() {
    measureViewport();
    gallery.arrange();
    hero.measure();
    trackers.forEach(function (tracker) { tracker.measure(); });
  }

  let lastTime = performance.now();

  function frame(time) {
    const dt = Math.min(0.064, (time - lastTime) / 1000);
    lastTime = time;
    if (lenis) lenis.raf(time);

    const scrollY = window.scrollY;
    page.classList.toggle("scrolled", scrollY > 100);
    hero.update(scrollY);
    gallery.update(scrollY);
    updateParallax(scrollY);
    updateFooter(scrollY);
    updateCards(dt);
    updateCursor(dt);

    requestAnimationFrame(frame);
  }

  measureAll();
  window.addEventListener("resize", measureAll);
  window.addEventListener("load", measureAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
  new ResizeObserver(measureAll).observe(document.querySelector(".contentContainer"));
  requestAnimationFrame(frame);
})();
