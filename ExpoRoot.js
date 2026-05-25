import { StyleSheet, View } from "react-native";

const SellerDashboardFrame = () => (
  <iframe
    src="/seller/index.html?v=20260525-product-detail-route"
    title="Poohter Seller Dashboard"
    style={styles.frame}
  />
);

export default function App() {
  return (
    <View style={styles.container}>
      <SellerDashboardFrame />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: "100vh",
    backgroundColor: "#f5f7fb",
  },
  frame: {
    width: "100%",
    height: "100vh",
    border: 0,
    display: "block",
  },
});
