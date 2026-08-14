import { PushApplePay } from '@pushcashco/capacitor';

window.testEcho = () => {
    const inputValue = document.getElementById("echoInput").value;
    PushApplePay.echo({ value: inputValue })
}
