document.addEventListener('DOMContentLoaded', async () => {
  await SS.init();

  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/';

  if (SS.me) {
    location.href = next;
    return;
  }

  const errorBox = document.getElementById('form-error');

  async function syncFirebaseUser() {
    const res = await SS.api('/api/auth/sync', { method: 'POST' });
    return res.user;
  }

  function showError(message) {
    errorBox.className = 'alert alert-danger small';
    errorBox.textContent = message;
    errorBox.classList.remove('d-none');
  }

  function showMessage(message) {
    errorBox.className = 'alert alert-success small';
    errorBox.textContent = message;
    errorBox.classList.remove('d-none');
  }

  function showVerificationHelp() {
    errorBox.className = 'alert alert-warning small';
    errorBox.innerHTML = 'Please verify your email before logging in. <button type="button" class="btn btn-link btn-sm p-0 align-baseline" id="resend-verification">Resend verification email</button>';
    errorBox.classList.remove('d-none');
    document.getElementById('resend-verification').addEventListener('click', async (event) => {
      const resend = event.currentTarget;
      resend.disabled = true;
      try {
        if (firebaseAuth.currentUser) await firebaseAuth.currentUser.sendEmailVerification();
        await firebaseAuth.signOut();
        showMessage('Verification email sent. Check your inbox, spam, and promotions folders.');
      } catch (err) {
        showError(err.message);
      }
    });
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.classList.add('d-none');
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Logging in…';
      try {
        if (!SS.firebaseReady) throw new Error('Firebase authentication is not configured.');
        await firebaseAuth.signInWithEmailAndPassword(document.getElementById('email').value, document.getElementById('password').value);
        await firebaseAuth.currentUser.reload();
        if (!firebaseAuth.currentUser.emailVerified) {
          showVerificationHelp();
          return;
        }
        await syncFirebaseUser();
        location.href = next;
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Log in';
      }
    });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.classList.add('d-none');
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating account…';
      try {
        if (!SS.firebaseReady) throw new Error('Firebase authentication is not configured.');
        const credential = await firebaseAuth.createUserWithEmailAndPassword(document.getElementById('email').value, document.getElementById('password').value);
        await credential.user.updateProfile({ displayName: document.getElementById('name').value.trim() });
        await credential.user.sendEmailVerification();
        await firebaseAuth.signOut();
        showMessage('Account created. Check your email and click the verification link before logging in.');
        btn.disabled = false;
        btn.textContent = 'Create account';
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Create account';
      }
    });
  }
});
