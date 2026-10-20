import { boot } from './main.js';
boot().catch(error => {
  console.error(error);
  document.getElementById('fatal-text').textContent=error.message;
  document.getElementById('fatal').hidden=false;
});
