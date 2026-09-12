<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
const props = defineProps<{ text: string }>();
const palette = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#ffaa00', '#aaaaaa',
  '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
const spans = computed(() => {
  const result: Array<{ text: string; style: CSSProperties }> = [];
  let style: CSSProperties = {}, text = '', obfuscated = false;
  const flush = (): void => { if (text) result.push({ text, style: { ...style } }); text = ''; };
  for (let index = 0; index < props.text.length; index++) {
    const character = props.text[index];
    const code = props.text[index + 1]?.toLowerCase();
    if (character === '§' && code && /^[0-9a-fk-or]$/.test(code)) {
      flush(); index++;
      if (/^[0-9a-f]$/.test(code)) { style = { color: palette[parseInt(code, 16)] }; obfuscated = false; }
      else if (code === 'r') { style = {}; obfuscated = false; }
      else if (code === 'l') style.fontWeight = 700;
      else if (code === 'o') style.fontStyle = 'italic';
      else if (code === 'k') obfuscated = true;
      else style.textDecoration = [style.textDecoration, code === 'm' ? 'line-through' : 'underline'].filter(Boolean).join(' ');
    } else text += obfuscated && character !== ' ' ? '•' : character;
  }
  flush();
  return result;
});
</script>

<template><span class="game-text"><span v-for="(span, index) in spans" :key="index" :style="span.style">{{ span.text }}</span></span></template>
