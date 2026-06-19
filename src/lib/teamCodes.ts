// Códigos FIFA de 3 letras por nombre de equipo en español
export const TEAM_CODE: Record<string, string> = {
  'México': 'MEX', 'Sudáfrica': 'RSA', 'Corea del Sur': 'KOR', 'Chequia': 'CZE',
  'Canadá': 'CAN', 'Bosnia': 'BIH', 'Brasil': 'BRA', 'Marruecos': 'MAR',
  'EE. UU.': 'USA', 'Paraguay': 'PAR', 'Australia': 'AUS', 'Turquía': 'TUR',
  'Alemania': 'GER', 'Curazao': 'CUW', 'España': 'ESP', 'Cabo Verde': 'CPV',
  'Francia': 'FRA', 'Senegal': 'SEN', 'Portugal': 'POR', 'RD Congo': 'COD',
  'Uzbekistán': 'UZB', 'Colombia': 'COL', 'Inglaterra': 'ENG', 'Croacia': 'CRO',
  'Argentina': 'ARG', 'Países Bajos': 'NED', 'Bélgica': 'BEL', 'Italia': 'ITA',
  'Suiza': 'SUI', 'Uruguay': 'URU', 'Ecuador': 'ECU', 'Chile': 'CHI',
  'Perú': 'PER', 'Venezuela': 'VEN', 'Bolivia': 'BOL', 'Japón': 'JPN',
  'Arabia Saudita': 'KSA', 'Irán': 'IRN', 'Catar': 'QAT', 'Nigeria': 'NGA',
  'Ghana': 'GHA', 'Camerún': 'CMR', 'Argelia': 'ALG', 'Egipto': 'EGY',
  'Túnez': 'TUN', 'Costa de Marfil': 'CIV', 'Nueva Zelanda': 'NZL',
  'Honduras': 'HON', 'Costa Rica': 'CRC', 'Jamaica': 'JAM', 'Panamá': 'PAN',
  'Trinidad y Tobago': 'TRI', 'Guatemala': 'GUA', 'Gales': 'WAL',
  'Escocia': 'SCO', 'Ucrania': 'UKR', 'Polonia': 'POL', 'Serbia': 'SRB',
  'Rumania': 'ROU', 'Hungría': 'HUN', 'Eslovaquia': 'SVK', 'Austria': 'AUT',
  'Dinamarca': 'DEN', 'Suecia': 'SWE', 'Noruega': 'NOR', 'Grecia': 'GRE',
  'China': 'CHN', 'Indonesia': 'IDN', 'Tailandia': 'THA', 'Vietnam': 'VIE',
  'Irak': 'IRQ', 'Jordania': 'JOR', 'Omán': 'OMA', 'Baréin': 'BHR',
  'Haití': 'HAI',
}

export function teamCode(name: string): string {
  return TEAM_CODE[name] ?? name.slice(0, 3).toUpperCase()
}
