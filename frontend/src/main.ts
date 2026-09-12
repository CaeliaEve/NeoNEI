import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import { start } from './offline/shell.ts';

start();
createApp(App).use(router).mount('#app');
