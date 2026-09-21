import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Toaster } from '@client/src/components/ui/sonner';

import Layout from './components/Layout';
import HomePage from './pages/HomePage/HomePage';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster position="top-center" />
    </>
  );
};

export default RoutesComponent;
