// The school's name for the language on screen: the Urdu name when the page is in Urdu and one
// has been set, otherwise the English name. Keeping this in one place means every header, sign-in
// page and document picks the same name.
import { useLang } from '../i18n/LanguageContext';

export const pickSchoolName = (school, lang) =>
  ((lang === 'ur' && (school?.nameUr || '').trim()) || school?.name || '');

export const useSchoolName = (school) => {
  const { lang } = useLang();
  return pickSchoolName(school, lang);
};

export default useSchoolName;
