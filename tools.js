document.addEventListener('DOMContentLoaded', () => {
  // Tabs Logic
  const tabs = document.querySelectorAll('.tab');
  const views = document.querySelectorAll('.view');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });

  // Calculator Logic
  const currentDisplay = document.getElementById('calc-current');
  const historyDisplay = document.getElementById('calc-history');
  let currentOperand = '0';
  let previousOperand = '';
  let operation = undefined;

  function updateDisplay() {
    currentDisplay.innerText = currentOperand;
    if (operation != null) {
      historyDisplay.innerText = `${previousOperand} ${operation}`;
    } else {
      historyDisplay.innerText = '';
    }
  }

  function clear() {
    currentOperand = '0';
    previousOperand = '';
    operation = undefined;
  }

  function deleteNumber() {
    if (currentOperand === '0') return;
    if (currentOperand.length === 1) {
      currentOperand = '0';
      return;
    }
    currentOperand = currentOperand.toString().slice(0, -1);
  }

  function appendNumber(number) {
    if (number === '.' && currentOperand.includes('.')) return;
    if (currentOperand === '0' && number !== '.') {
      currentOperand = number.toString();
    } else {
      currentOperand = currentOperand.toString() + number.toString();
    }
  }

  function chooseOperation(op) {
    if (currentOperand === '') return;
    if (previousOperand !== '') {
      compute();
    }
    operation = op;
    previousOperand = currentOperand;
    currentOperand = '';
  }

  function compute() {
    let computation;
    const prev = parseFloat(previousOperand);
    const current = parseFloat(currentOperand);
    if (isNaN(prev) || isNaN(current)) return;
    switch (operation) {
      case '+':
        computation = prev + current;
        break;
      case '-':
        computation = prev - current;
        break;
      case '*':
        computation = prev * current;
        break;
      case '/':
        computation = prev / current;
        break;
      case '%':
        computation = prev % current;
        break;
      default:
        return;
    }
    currentOperand = computation.toString();
    operation = undefined;
    previousOperand = '';
  }

  document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', () => {
      const val = button.dataset.val;
      if (button.classList.contains('num')) {
        appendNumber(val);
      } else if (button.classList.contains('op')) {
        chooseOperation(val);
      } else if (button.classList.contains('eq')) {
        compute();
      } else if (val === 'C') {
        clear();
      } else if (val === 'DEL') {
        deleteNumber();
      } else if (val === '±') {
        if (currentOperand !== '0') {
          currentOperand = (parseFloat(currentOperand) * -1).toString();
        }
      }
      updateDisplay();
    });
  });

  // Converter Logic
  const units = {
    length: {
      meters: 1,
      kilometers: 1000,
      centimeters: 0.01,
      millimeters: 0.001,
      miles: 1609.34,
      yards: 0.9144,
      feet: 0.3048,
      inches: 0.0254
    },
    weight: {
      kilograms: 1,
      grams: 0.001,
      milligrams: 0.000001,
      pounds: 0.453592,
      ounces: 0.0283495
    },
    temperature: {
      celsius: 'C',
      fahrenheit: 'F',
      kelvin: 'K'
    }
  };

  const typeSelect = document.getElementById('conv-type');
  const fromUnit = document.getElementById('conv-from-unit');
  const toUnit = document.getElementById('conv-to-unit');
  const fromVal = document.getElementById('conv-from-val');
  const toVal = document.getElementById('conv-to-val');

  function populateUnits() {
    const type = typeSelect.value;
    const typeUnits = Object.keys(units[type]);
    
    fromUnit.innerHTML = '';
    toUnit.innerHTML = '';
    
    typeUnits.forEach(u => {
      fromUnit.options.add(new Option(u.charAt(0).toUpperCase() + u.slice(1), u));
      toUnit.options.add(new Option(u.charAt(0).toUpperCase() + u.slice(1), u));
    });
    
    // Set different default for toUnit if possible
    if (typeUnits.length > 1) {
      toUnit.selectedIndex = 1;
    }
    convert();
  }

  function convert() {
    const type = typeSelect.value;
    const fUnit = fromUnit.value;
    const tUnit = toUnit.value;
    const val = parseFloat(fromVal.value);

    if (isNaN(val)) {
      toVal.value = '';
      return;
    }

    if (type === 'temperature') {
      let c;
      // Convert to Celsius first
      if (fUnit === 'celsius') c = val;
      else if (fUnit === 'fahrenheit') c = (val - 32) * 5/9;
      else if (fUnit === 'kelvin') c = val - 273.15;

      // Convert Celsius to target
      let res;
      if (tUnit === 'celsius') res = c;
      else if (tUnit === 'fahrenheit') res = (c * 9/5) + 32;
      else if (tUnit === 'kelvin') res = c + 273.15;
      
      toVal.value = parseFloat(res.toFixed(4));
    } else {
      const baseVal = val * units[type][fUnit];
      const res = baseVal / units[type][tUnit];
      toVal.value = parseFloat(res.toFixed(4));
    }
  }

  typeSelect.addEventListener('change', populateUnits);
  fromUnit.addEventListener('change', convert);
  toUnit.addEventListener('change', convert);
  fromVal.addEventListener('input', convert);

  // Init
  populateUnits();
});
