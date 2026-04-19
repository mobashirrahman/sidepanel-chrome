document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('close-btn').addEventListener('click', () => {
    // window.close() usually works for extension pages if called from a script
    window.close();
  });
});
