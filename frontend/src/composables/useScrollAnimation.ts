import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 滚动动画组合式函数
 * 当元素进入视口时触发动画
 */
export function useScrollAnimation() {
  const isVisible = ref(false);
  const elementRef = ref<HTMLElement | null>(null);

  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (!elementRef.value) return;

    // 创建 IntersectionObserver 监听元素是否进入视口
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisible.value = true;
            // 动画触发后可以选择停止观察
            // observer?.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1, // 元素进入10%时触发
        rootMargin: '0px 0px -50px 0px', // 提前50px触发
      }
    );

    observer.observe(elementRef.value);
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
    }
  });

  return {
    elementRef,
    isVisible,
  };
}

/**
 * 视差滚动效果
 * 鼠标移动时产生微妙的视差效果
 */
export function useParallax() {
  const elementRef = ref<HTMLElement | null>(null);

  const handleMouseMove = (e: MouseEvent) => {
    if (!elementRef.value) return;

    const rect = elementRef.value.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    // 计算旋转角度（非常微小的移动）
    const rotateX = (mouseY / rect.height) * -2; // 上下翻转
    const rotateY = (mouseX / rect.width) * 2;   // 左右翻转

    elementRef.value.style.transform = `
      perspective(1000px)
      rotateX(${rotateX}deg)
      rotateY(${rotateY}deg)
      scale3d(1.02, 1.02, 1.02)
    `;
  };

  const resetTransform = () => {
    if (!elementRef.value) return;
    elementRef.value.style.transform = '';
  };

  onMounted(() => {
    if (elementRef.value) {
      elementRef.value.addEventListener('mousemove', handleMouseMove);
      elementRef.value.addEventListener('mouseleave', resetTransform);
    }
  });

  onUnmounted(() => {
    if (elementRef.value) {
      elementRef.value.removeEventListener('mousemove', handleMouseMove);
      elementRef.value.removeEventListener('mouseleave', resetTransform);
    }
  });

  return {
    elementRef,
  };
}

/**
 * 磁性按钮效果
 * 按钮会轻微跟随鼠标移动
 */
export function useMagneticButton(strength = 0.3) {
  const elementRef = ref<HTMLElement | null>(null);

  const handleMouseMove = (e: MouseEvent) => {
    if (!elementRef.value) return;

    const rect = elementRef.value.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    const translateX = mouseX * strength;
    const translateY = mouseY * strength;

    elementRef.value.style.transform = `translate(${translateX}px, ${translateY}px)`;
  };

  const resetTransform = () => {
    if (!elementRef.value) return;
    elementRef.value.style.transform = '';
  };

  onMounted(() => {
    if (elementRef.value) {
      elementRef.value.addEventListener('mousemove', handleMouseMove);
      elementRef.value.addEventListener('mouseleave', resetTransform);
    }
  });

  onUnmounted(() => {
    if (elementRef.value) {
      elementRef.value.removeEventListener('mousemove', handleMouseMove);
      elementRef.value.removeEventListener('mouseleave', resetTransform);
    }
  });

  return {
    elementRef,
  };
}

/**
 * 数字滚动动画
 * 从0滚动到目标数字
 */
export function useCountUp(duration = 1000) {
  const currentNumber = ref(0);
  const isAnimating = ref(false);

  const animateTo = (target: number) => {
    if (isAnimating.value) return;

    isAnimating.value = true;
    const startTime = performance.now();
    const startNumber = currentNumber.value;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // 使用easeOutQuart缓动函数
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      currentNumber.value = Math.floor(startNumber + (target - startNumber) * easeOutQuart);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        currentNumber.value = target;
        isAnimating.value = false;
      }
    };

    requestAnimationFrame(animate);
  };

  return {
    currentNumber,
    animateTo,
    isAnimating,
  };
}

/**
 * 打字机效果
 */
export function useTypewriter(text: string, speed = 50) {
  const displayedText = ref('');
  const isTyping = ref(false);
  const isComplete = ref(false);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const start = () => {
    isTyping.value = true;
    isComplete.value = false;
    displayedText.value = '';

    let index = 0;
    const type = () => {
      if (index < text.length) {
        displayedText.value += text[index];
        index++;
        timeoutId = setTimeout(type, speed);
      } else {
        isTyping.value = false;
        isComplete.value = true;
      }
    };

    type();
  };

  const reset = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    displayedText.value = '';
    isTyping.value = false;
    isComplete.value = false;
  };

  onUnmounted(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });

  return {
    displayedText,
    isTyping,
    isComplete,
    start,
    reset,
  };
}

/**
 | * 波纹点击效果
 */
export function useRipple() {
  const createRipple = (event: MouseEvent, element: HTMLElement) => {
    const circle = document.createElement('span');
    const diameter = Math.max(element.clientWidth, element.clientHeight);
    const radius = diameter / 2;

    const rect = element.getBoundingClientRect();

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - rect.left - radius}px`;
    circle.style.top = `${event.clientY - rect.top - radius}px`;
    circle.classList.add('ripple');

    const ripple = element.getElementsByClassName('ripple')[0];

    if (ripple) {
      ripple.remove();
    }

    element.appendChild(circle);
  };

  return {
    createRipple,
  };
}

/**
 * 鼠标跟随效果
 */
export function useCursorFollower() {
  const cursor = ref<HTMLElement | null>(null);
  const follower = ref<HTMLElement | null>(null);
  const isActive = ref(false);

  onMounted(() => {
    // 创建自定义光标元素
    cursor.value = document.createElement('div');
    cursor.value.className = 'cursor-follower';
    cursor.value.style.cssText = `
      position: fixed;
      width: 8px;
      height: 8px;
      background: var(--color-accent);
      border-radius: 50%;
      pointer-events: none;
      z-index: 9999;
      transition: transform 0.1s ease-out, opacity 0.2s ease-out;
    `;
    document.body.appendChild(cursor.value);

    const handleMouseMove = (e: MouseEvent) => {
      if (!cursor.value) return;

      cursor.value.style.left = `${e.clientX}px`;
      cursor.value.style.top = `${e.clientY}px`;
    };

    const handleMouseDown = () => {
      if (cursor.value) {
        cursor.value.style.transform = 'scale(2)';
        isActive.value = true;
      }
    };

    const handleMouseUp = () => {
      if (cursor.value) {
        cursor.value.style.transform = 'scale(1)';
        isActive.value = false;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);

    onUnmounted(() => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      if (cursor.value) {
        cursor.value.remove();
      }
    });
  });

  return {
    isActive,
  };
}

/**
 * 懒加载动画
 * 元素进入视口时触发懒加载
 */
export function useLazyLoad(threshold = 0.1) {
  const isLoaded = ref(false);
  const elementRef = ref<HTMLElement | null>(null);

  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (!elementRef.value) return;

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoaded.value) {
            isLoaded.value = true;
            observer?.unobserve(entry.target);
          }
        });
      },
      { threshold }
    );

    observer.observe(elementRef.value);
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
    }
  });

  return {
    elementRef,
    isLoaded,
  };
}
