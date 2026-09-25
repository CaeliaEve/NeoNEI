import { ref, onMounted, onUnmounted } from 'vue';

export function useLazyImage() {
  const imageCache = new Map<string, boolean>();

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (imageCache.has(src)) {
        const img = new Image();
        img.src = src;
        resolve(img);
        return;
      }

      const img = new Image();
      img.onload = () => {
        imageCache.set(src, true);
        resolve(img);
      };
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${src}`));
      };
      img.src = src;
    });
  };

  return {
    loadImage,
    isCached: (src: string) => imageCache.has(src),
  };
}

export function setupLazyImageDirective() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const src = img.dataset.src as string;

          if (src) {
            loadImage(src, img);
            observer.unobserve(img);
          }
        }
      });
    },
    {
      rootMargin: '50px',
      threshold: 0.01,
    },
  );

  const loadImage = (src: string, img: HTMLImageElement) => {
    const tempImg = new Image();
    tempImg.onload = () => {
      img.src = src;
      img.classList.remove('lazy-loading');
      img.classList.add('lazy-loaded');
    };
    tempImg.onerror = () => {
      img.src = '/placeholder.png';
      img.classList.remove('lazy-loading');
      img.classList.add('lazy-error');
    };
    tempImg.src = src;
  };

  onUnmounted(() => {
    observer.disconnect();
  });

  return {
    observer,
  };
}

export function useImageLazyLoad(options?: {
  rootMargin?: string;
  threshold?: number;
}) {
  const targetRef = ref<HTMLElement | null>(null);
  const isLoaded = ref(false);
  const isLoading = ref(true);
  const hasError = ref(false);

  let observer: IntersectionObserver | null = null;

  const isElementVisible = (element: HTMLElement) => {
    const parsedMargin = options?.rootMargin ? parseInt(options.rootMargin, 10) : 50;
    const margin = Number.isFinite(parsedMargin) ? parsedMargin : 50;
    const rect = element.getBoundingClientRect();
    return rect.top < window.innerHeight + margin && rect.bottom > -margin;
  };

  const loadCurrentImage = () => {
    const element = targetRef.value;
    if (!element || !element.dataset.src) return;

    const src = element.dataset.src;
    const img = new Image();

    img.onload = () => {
      isLoaded.value = true;
      isLoading.value = false;
      hasError.value = false;
    };

    img.onerror = () => {
      isLoading.value = false;
      hasError.value = true;
      isLoaded.value = false;
    };

    img.src = src;
  };

  onMounted(() => {
    const element = targetRef.value;
    if (!element) return;

    const checkInitialVisibility = () => {
      if (isElementVisible(element) && element.dataset.src) {
        loadCurrentImage();
      }
    };

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoaded.value) {
            loadCurrentImage();
            observer?.unobserve(element);
          }
        });
      },
      {
        rootMargin: options?.rootMargin || '50px',
        threshold: options?.threshold || 0.01,
      },
    );

    observer.observe(element);
    checkInitialVisibility();
  });

  onUnmounted(() => {
    if (observer && targetRef.value) {
      observer.unobserve(targetRef.value);
    }
  });

  const setImageUrl = (url: string) => {
    const element = targetRef.value;
    if (!element) return;

    element.dataset.src = url;
    if (!isLoaded.value && isElementVisible(element)) {
      loadCurrentImage();
      observer?.unobserve(element);
    }
  };

  return {
    targetRef,
    isLoaded,
    isLoading,
    hasError,
    setImageUrl,
  };
}
