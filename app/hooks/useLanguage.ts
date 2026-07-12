import { useSelector } from 'react-redux';
import { RootState } from '@/redux/store';

export const useLanguage = () => {
  const language = useSelector((state: RootState) => state.language.currentLanguage);
  const translations = useSelector((state: RootState) => state.language.translations);

  const t = (key: string): string | string[] => {
    return translations[language][key] || key;
  };

  return { t, language };
}; 
