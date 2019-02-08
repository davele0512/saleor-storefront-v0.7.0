import * as React from "react";

import { UserContextInterface } from "../components/User/context";
import {
  CheckoutContext,
  CheckoutContextInterface,
  CheckoutStep
} from "./context";
import { TypedGetCheckoutQuery, TypedGetUserCheckoutQuery } from "./queries";

enum LocalStorageKeys {
  Token = "checkoutToken"
}

interface ProviderProps {
  user: UserContextInterface;
}

type ProviderState = CheckoutContextInterface;

class Provider extends React.Component<ProviderProps, ProviderState> {
  providerContext = {};

  constructor(props: ProviderProps) {
    super(props);
    this.state = {
      cardData: null,
      checkout: null,
      loading: !!this.getStoredToken(),
      shippingAsBilling: false,
      /**
       * Flag to determine, when the user checkout should be fetched from the
       * API and override the current, storred one - happens after user log in
       */
      syncUserCheckout: false,
      /**
       * Flag to determine, when the cart lines should override the checkout
       * lines - happens after user logs in
       */
      syncWithCart: false
    };
  }

  getStoredToken = (): null | string =>
    localStorage.getItem(LocalStorageKeys.Token);

  getContext = (): CheckoutContextInterface => ({
    ...this.state,
    clear: this.clear,
    step: this.getCurrentStep(),
    update: this.update
  });

  getCurrentStep() {
    const { checkout, cardData } = this.state;

    if (!checkout) {
      return CheckoutStep.ShippingAddress;
    }

    const isShippingOptionStep =
      checkout.availableShippingMethods.length && checkout.shippingAddress;
    const isBillingStep = isShippingOptionStep && checkout.shippingMethod;
    const isPaymentStep = isBillingStep && checkout.billingAddress;
    const isReviewStep = isPaymentStep && cardData;

    if (isReviewStep) {
      return CheckoutStep.Review;
    } else if (isPaymentStep) {
      return CheckoutStep.Payment;
    } else if (isBillingStep) {
      return CheckoutStep.BillingAddress;
    } else if (isShippingOptionStep) {
      return CheckoutStep.ShippingOption;
    }
    return CheckoutStep.ShippingAddress;
  }

  clear = () => {
    this.setState({
      cardData: null,
      checkout: null,
      shippingAsBilling: false,
      step: CheckoutStep.ShippingAddress
    });
    localStorage.removeItem(LocalStorageKeys.Token);
  };

  update = (checkoutData: CheckoutContextInterface) => {
    this.setState({ ...checkoutData, step: this.getCurrentStep() }, () => {
      if ("checkout" in checkoutData) {
        this.setCheckoutToken();
      }
    });
  };

  setCheckoutToken = () => {
    localStorage.setItem(LocalStorageKeys.Token, this.state.checkout.token);
  };

  componentDidUpdate(prevProps: ProviderProps) {
    const { user: prevUser } = prevProps.user;
    const { user: currUser } = this.props.user;
    const { syncUserCheckout } = this.state;

    if (!prevUser && currUser && !syncUserCheckout) {
      this.setState({ syncUserCheckout: true });
    }
  }

  render() {
    const token = this.getStoredToken();
    const {
      user: { user, loading: userLoading }
    } = this.props;
    const { checkout: stateCheckout, syncUserCheckout } = this.state;
    const skipUserCheckoutFetch = !syncUserCheckout;

    return (
      <TypedGetUserCheckoutQuery
        alwaysRender
        displayLoader={false}
        skip={skipUserCheckoutFetch}
        onCompleted={({ me: { checkout } }) => {
          if (checkout && syncUserCheckout) {
            this.setState(
              {
                checkout,
                loading: false,
                syncUserCheckout: false,
                syncWithCart: true
              },
              this.setCheckoutToken
            );
          } else if (!checkout && syncUserCheckout) {
            this.setState({ syncUserCheckout: false });
          }
        }}
      >
        {({ loading: userCheckoutLoading }) => {
          const skipLocalStorageCheckoutFetch = !!(
            userCheckoutLoading ||
            userLoading ||
            !token ||
            stateCheckout ||
            user
          );

          return (
            <TypedGetCheckoutQuery
              alwaysRender
              displayLoader={false}
              variables={{ token }}
              skip={skipLocalStorageCheckoutFetch}
              onCompleted={({ checkout }) => {
                if (checkout && !stateCheckout) {
                  this.setState(
                    { checkout, loading: false },
                    this.setCheckoutToken
                  );
                }
              }}
            >
              {() => (
                <CheckoutContext.Provider value={this.getContext()}>
                  {this.props.children}
                </CheckoutContext.Provider>
              )}
            </TypedGetCheckoutQuery>
          );
        }}
      </TypedGetUserCheckoutQuery>
    );
  }
}

export default Provider;