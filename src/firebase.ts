import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth } from 'firebase/auth'

export const firebaseConfig = {
  apiKey: 'AIzaSyBa6fcCJGA4BK4XQPDPJJIXPh6o2NHIi6U',
  authDomain: 'badminton-match-manager-e5ad8.firebaseapp.com',
  databaseURL: 'https://badminton-match-manager-e5ad8-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'badminton-match-manager-e5ad8',
  storageBucket: 'badminton-match-manager-e5ad8.firebasestorage.app',
  messagingSenderId: '26885628676',
  appId: '1:26885628676:web:9c4ddcae2e0d339724a651',
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)
export const fbAuth = getAuth(app)
export const ROOT = 'badminton'

// このアプリのID（例：ab3x9k2m）はメールアドレス形式ではないため、
// Firebase Authenticationに登録する際はダミードメインを付けたメール形式に変換する
// （実際にメールが送信されることはない、内部的な変換のみ）
export const emailForId = (id: string) => `${id}@badminton.local`
