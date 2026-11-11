#!/usr/bin/env node
'use strict';
/** Admin parolini qo'lda o'zgartirish:  npm run set-password -- "yangiParol" [login] */
const auth = require('../lib/auth');

const [, , password, username] = process.argv;
if (!password || password.length < 8) {
  console.error('Foydalanish: npm run set-password -- "yangiParol" [login]  (parol kamida 8 belgi)');
  process.exit(1);
}
auth.ensureAdmin();
auth.setPassword(password, username);
console.log('Parol yangilandi.');
