const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const authMessage = document.getElementById("authMessage");


// =========================
// Login
// =========================

loginForm.addEventListener("submit", async (event) => {

  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  loginButton.disabled = true;
  authMessage.textContent = "Logging in...";


  try {

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });


    if (error) {
      throw error;
    }


    if (!data.session) {
      throw new Error("Login failed.");
    }


    // Successful login
    window.location.href = "dashboard.html";


  } catch (error) {

    console.error(error);

    authMessage.textContent =
      error.message || "Invalid email or password.";

  } finally {

    loginButton.disabled = false;

  }

});