$form.find('#ff_2285_names_first_name_, #ff_2285_names_last_name_, #ff_2285_input_text_2, #ff_2285_input_text_4').on('input', function(e) {
    var inputValue = e.target.value;
    var sanitizedValue = inputValue.replace(/[0-9]/g, ''); // Remove numbers
    if (inputValue !== sanitizedValue) {
        e.target.value = sanitizedValue; // Update input value without numbers
    }
});

// Assuming $form is the jQuery DOM object of the form

$form.find("input[name='names[first_name]']").on('input', function (e) {
var inputValue = e.target.value;
// Allow only letters and spaces
var sanitizedValue = inputValue.replace(/[^a-zA-Z\s]/g, '');

if (inputValue !== sanitizedValue) {
e.target.value = sanitizedValue;
showErrorMessage(e.target, "");
} else {
hideErrorMessage(e.target);
}
});

$form.find("input[name='names[last_name]']").on('input', function (e) {
var inputValue = e.target.value;
// Allow only letters and spaces
var sanitizedValue = inputValue.replace(/[^a-zA-Z\s]/g, '');

if (inputValue !== sanitizedValue) {
e.target.value = sanitizedValue;
showErrorMessage(e.target, "");
} else {
hideErrorMessage(e.target);
}
});





$(document).ready(function() {
    // Attach an event listener to the phone field
    $('#ff_2285_input_text').on('input', function() {
        // Use a regular expression to remove non-numeric characters
        var sanitizedValue = $(this).val().replace(/[^0-9]/g, '');
        
        // Set the input field value to the sanitized value
        $(this).val(sanitizedValue);
    });
});


$(document).ready(function() {
    // Function to filter non-alphabetic characters
    function filterNonAlphabetic(inputElement) {
        // Use a regular expression to allow only letters and spaces
        var sanitizedValue = inputElement.val().replace(/[^a-zA-Z\s]/g, '');
        
        // Set the input field value to the sanitized value
        inputElement.val(sanitizedValue);
    }
    
    // Attach event listeners to the Job Title and City fields
    $('#ff_2285_input_text_2').on('input', function() {
        // Call the function to filter non-alphabetic characters
        filterNonAlphabetic($(this));
    });
});

$(document).ready(function() {
    // Function to filter non-alphabetic characters from the input
    function filterNonAlphabetic(inputElement) {
        // Use a regular expression to allow only letters and spaces
        var sanitizedValue = inputElement.val().replace(/[^a-zA-Z\s]/g, '');
        
        // Set the input field value to the sanitized value
        inputElement.val(sanitizedValue);
    }
    
    // Attach an event listener to the City field (input_text_4)
    $('#ff_2285_input_text_4').on('input', function() {
        // Call the function to filter non-alphabetic characters
        filterNonAlphabetic($(this));
    });
});


function showErrorMessage(inputElement, message) {
var errorElementId = inputElement.id + "-error";
var errorElement = document.getElementById(errorElementId);

if (!errorElement) {
errorElement = document.createElement("div");
errorElement.id = errorElementId;
errorElement.className = "error-message";
errorElement.style.color = "red"; // Set the text color to red
errorElement.style.fontSize = "small"; // Set the font size to small
inputElement.parentNode.appendChild(errorElement);
}

errorElement.innerText = message;
}

function hideErrorMessage(inputElement) {
var errorElementId = inputElement.id + "-error";
var errorElement = document.getElementById(errorElementId);

if (errorElement) {
errorElement.parentNode.removeChild(errorElement);
}
}