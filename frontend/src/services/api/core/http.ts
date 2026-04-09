import axios from 'axios';

export const API_BASE_URL = __API_BASE_URL__;
export const BACKEND_BASE_URL = __BACKEND_BASE_URL__;

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});