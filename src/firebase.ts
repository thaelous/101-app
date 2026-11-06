import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBzno05aK7Xb9x3ZY_k-UkXLCCgum-ZiTs",
  authDomain: "libros-1f750.firebaseapp.com",
  projectId: "libros-1f750",
  storageBucket: "libros-1f750.firebasestorage.app",
  messagingSenderId: "278349377685",
  appId: "1:278349377685:web:34990f3b0f1f6b4bda6b9c"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
