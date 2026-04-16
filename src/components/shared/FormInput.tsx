import React from 'react';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  datalist?: string[];
  datalistId?: string;
  wrapperStyle?: React.CSSProperties;
}

export function FormInput({ 
  label, 
  datalist, 
  datalistId, 
  wrapperStyle, 
  ...props 
}: FormInputProps) {
  return (
    <div className="input-group" style={wrapperStyle}>
      <label>{label}</label>
      <input 
        {...props} 
        list={datalistId}
      />
      {datalist && datalistId && (
        <datalist id={datalistId}>
          {datalist.map(option => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </div>
  );
}
