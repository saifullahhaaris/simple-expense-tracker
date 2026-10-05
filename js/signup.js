const signupForm = document.getElementById("signupForm");
const signupButton = document.getElementById("signupButton");
const authMessage = document.getElementById("authMessage");


signupForm.addEventListener("submit", async (event) => {

  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  signupButton.disabled = true;
  authMessage.textContent = "Creating account...";


  try {

    const { data, error } =
      await supabaseClient.auth.signUp({
        email,
        password
      });


    if (error) {
      throw error;
    }


    if (data.session) {

      authMessage.textContent =
        "Account created successfully.";

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1000);

    } else {

      authMessage.textContent =
        "Account created. Please check your email to confirm your account.";

    }


  } catch (error) {

    console.error(error);

    authMessage.textContent =
      error.message || "Could not create account.";

  } finally {

    signupButton.disabled = false;

  }

});