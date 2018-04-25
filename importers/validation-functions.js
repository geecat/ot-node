var validator = require('validator');

function providerIdValidation(provider_id, validation_object) {
    const data = provider_id;
    const object = validation_object;
    if (data.length === 12) {
        return true;
    }
    return false;
}

function emailValidation(email) {
    const result = validator.isEmail(email);

    if (result) {
        return true;
    }
    return false;
}

function dateTimeValidation(date) {
    const result = validator.isISO8601(date);

    if (result) {
        return true;
    }
    return false;
}

function countryValidation(country) {
    const postal_code = country;

    if (postal_code.length > 2) {
        return false;
    }
    return true;
}

function postalCodeValidation(code) {
    const result = validator.isNumeric(code);

    if (result) {
        return true;
    }
    return false;
}

function longLatValidation(data) {
    const result = validator.isLatLong(data);
    if (result) {
        return true;
    }
    return false;
}

function ean13Validation(code) {
    const ean = code;

    var checkSum = ean.split('').reduce((p, v, i) => (i % 2 == 0 ? p + 1 * v : p + 3 * v), 0);

    if (checkSum % 10 != 0) {
        return false;
    }
    return true;
}

function numberValidation(num) {
    const number = validator.isDecimal(num, { locale: 'en-AU' });

    if (number) {
        return true;
    }
    return false;
}

function ethWalletValidation(wallet) {
    const eth_wallet = wallet;

    const first_char = eth_wallet.charAt(0);
    const second_char = eth_wallet.charAt(1);
    const rest = eth_wallet.substr(2);
    const rest_hex = validator.isHexadecimal(rest);

    var valid = false;

    if (rest_hex && rest.length === 40) {
        valid = true;
    }

    if (first_char === '0' && second_char === 'x' && valid) {
        return true;
    }
    return false;
}


var ean = '501234567790';


var ean_result = ean13Validation(ean);


var proba = '153545354111';
var email_data = 'steva.com';
var date_data = '2003-05-09T00:31:52Z';
var country_data = 'ITA';
var postal_data = 'adadad';
var lat_long_data = '6104898.16234.0';
var number_data = '135,453.325';


var result = providerIdValidation(proba);
var email_result = emailValidation(email_data);
var date_result = dateTimeValidation(date_data);
var country_result = countryValidation(country_data);
var postal_result = postalCodeValidation(postal_data);
var lat_long = longLatValidation(lat_long_data);
var number_result = numberValidation(number_data);


var email = validator.isEmail('foo@bar.com');


var eth_wallet = '0x123f681646d4a755815f9cb1ne1acc8565a0c2ac';
var eth_result = ethWalletValidation(eth_wallet);
const first_char = eth_wallet.charAt(0);
const second_char = eth_wallet.charAt(1);
const rest = eth_wallet.substr(2);

console.log(eth_result);
console.log(second_char);
console.log(rest.length);

